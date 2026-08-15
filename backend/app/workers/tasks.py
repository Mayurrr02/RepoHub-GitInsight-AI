import asyncio
import time
from datetime import datetime, timezone
from app.core.metrics import celery_task_duration_seconds, sync_jobs_total
from app.core.ws_manager import publish_realtime_event
from app.db.session import SessionLocal
from app.models import GitHubAccount, Notification, Repository, SyncJob
from app.services.analytics import calculate_developer_metrics, calculate_repository_metrics
from app.services.github import fetch_repositories, fetch_repository_data, persist_repositories, persist_repository_data
from app.workers.celery_app import celery_app


@celery_app.task(name="repositories.sync")
def sync_repositories(job_id: int) -> int:
    start_time = time.time()
    db = SessionLocal()
    job = db.get(SyncJob, job_id)
    if not job:
        db.close()
        return 0

    user_id = job.user_id

    try:
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        publish_realtime_event(
            event="sync_progress",
            data={
                "job_id": job.id,
                "status": "running",
                "progress": 10,
                "step": "Connecting to GitHub and fetching repository list...",
            },
            user_id=user_id,
        )

        account = db.query(GitHubAccount).filter(GitHubAccount.user_id == user_id).one()
        raw_repos = asyncio.run(fetch_repositories(account.access_token))
        count = persist_repositories(db, user_id, raw_repos)

        publish_realtime_event(
            event="sync_progress",
            data={
                "job_id": job.id,
                "status": "running",
                "progress": 35,
                "step": f"Synced {count} repositories. Ingesting commits, pull requests, and reviews...",
            },
            user_id=user_id,
        )

        user_repos = db.query(Repository).filter_by(user_id=user_id).all()
        total_repos = max(1, len(user_repos))

        for idx, repository in enumerate(user_repos, start=1):
            repo_data = asyncio.run(fetch_repository_data(account.access_token, repository.full_name))
            persist_repository_data(db, repository, repo_data)
            calculate_repository_metrics(db, repository)

            progress_pct = min(85, 35 + int((idx / total_repos) * 50))
            publish_realtime_event(
                event="sync_progress",
                data={
                    "job_id": job.id,
                    "status": "running",
                    "progress": progress_pct,
                    "step": f"Processing ({idx}/{total_repos}): {repository.name}...",
                },
                user_id=user_id,
            )

        publish_realtime_event(
            event="sync_progress",
            data={
                "job_id": job.id,
                "status": "running",
                "progress": 90,
                "step": "Calculating developer metrics and engineering scores...",
            },
            user_id=user_id,
        )

        calculate_developer_metrics(db, user_id)
        db.commit()

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)

        notification = Notification(
            user_id=user_id,
            type="sync_completed",
            message=f"Successfully synced {count} repositories with full analytics.",
            read=False,
        )
        db.add(notification)
        db.commit()

        sync_jobs_total.labels(status="completed").inc()

        publish_realtime_event(
            event="sync_completed",
            data={
                "job_id": job.id,
                "status": "completed",
                "progress": 100,
                "count": count,
                "message": f"Successfully synced {count} repositories.",
            },
            user_id=user_id,
        )
        return count

    except Exception as exc:
        if job:
            job.status = "failed"
            job.error = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

            sync_jobs_total.labels(status="failed").inc()
            publish_realtime_event(
                event="sync_failed",
                data={
                    "job_id": job.id,
                    "status": "failed",
                    "error": str(exc),
                },
                user_id=user_id,
            )
        raise
    finally:
        celery_task_duration_seconds.labels(task_name="repositories.sync").observe(time.time() - start_time)
        db.close()
