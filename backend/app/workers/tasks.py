import asyncio
from datetime import datetime, timezone
from app.db.session import SessionLocal
from app.models import GitHubAccount, Repository, SyncJob
from app.services.analytics import calculate_developer_metrics, calculate_repository_metrics
from app.services.github import fetch_repositories, fetch_repository_data, persist_repositories, persist_repository_data
from app.workers.celery_app import celery_app

@celery_app.task(name="repositories.sync")
def sync_repositories(job_id: int) -> int:
    db = SessionLocal()
    job = db.get(SyncJob, job_id)
    try:
        if not job: return 0
        job.status, job.started_at = "running", datetime.now(timezone.utc); db.commit()
        account = db.query(GitHubAccount).filter(GitHubAccount.user_id == job.user_id).one()
        count = persist_repositories(db, job.user_id, asyncio.run(fetch_repositories(account.access_token)))
        for repository in db.query(Repository).filter_by(user_id=job.user_id):
            persist_repository_data(db, repository, asyncio.run(fetch_repository_data(account.access_token, repository.full_name)))
            calculate_repository_metrics(db, repository)
        calculate_developer_metrics(db, job.user_id)
        db.commit()
        job.status, job.completed_at = "completed", datetime.now(timezone.utc); db.commit()
        return count
    except Exception as exc:
        if job:
            job.status, job.error, job.completed_at = "failed", str(exc), datetime.now(timezone.utc); db.commit()
        raise
    finally:
        db.close()
