from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import Commit, Contributor, GitHubAccount, Issue, Language, PullRequest, Repository, RepositoryMetric, SyncJob, User
from app.schemas.schemas import RepositoryDetailOut, RepositoryOut, SyncQueued
from app.services.analytics import calculate_repository_metrics
from app.workers.tasks import sync_repositories

router = APIRouter(prefix="/repositories", tags=["Repositories"])

@router.get("", response_model=list[RepositoryOut])
def list_repositories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Repository).where(Repository.user_id == user.id).order_by(Repository.updated_at.desc())).all()

@router.get("/{id}", response_model=RepositoryDetailOut)
def get_repository_detail(id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    repo = db.scalar(select(Repository).where(Repository.id == id, Repository.user_id == user.id))
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    metric = calculate_repository_metrics(db, repo)
    commits = db.scalars(
        select(Commit)
        .where(Commit.repository_id == repo.id)
        .order_by(Commit.committed_at.desc().nullslast())
    ).all()
    prs = db.scalars(select(PullRequest).where(PullRequest.repository_id == repo.id)).all()
    issues = db.scalars(select(Issue).where(Issue.repository_id == repo.id)).all()
    contributors = db.scalars(
        select(Contributor)
        .where(Contributor.repository_id == repo.id)
        .order_by(Contributor.contributions.desc())
        .limit(10)
    ).all()
    languages = db.scalars(
        select(Language)
        .where(Language.repository_id == repo.id)
        .order_by(Language.bytes.desc())
    ).all()

    total_bytes = sum(l.bytes for l in languages) or 1
    languages_out = [
        {"name": l.name, "bytes": l.bytes, "percent": round(l.bytes * 100 / total_bytes, 1)}
        for l in languages
    ]

    open_prs = sum(1 for pr in prs if pr.state == "open")
    merged_prs = sum(1 for pr in prs if pr.merged_at is not None)
    closed_prs = sum(1 for pr in prs if pr.state == "closed" and pr.merged_at is None)

    open_issues = sum(1 for i in issues if i.state == "open")
    closed_issues = sum(1 for i in issues if i.closed_at is not None or i.state == "closed")

    recent_commits = [
        {
            "sha": c.sha,
            "message": c.message,
            "author_login": c.author_login,
            "committed_at": c.committed_at,
        }
        for c in commits[:10]
    ]

    db.commit()

    return {
        "id": repo.id,
        "github_id": repo.github_id,
        "name": repo.name,
        "full_name": repo.full_name,
        "html_url": repo.html_url,
        "clone_url": f"{repo.html_url}.git",
        "description": repo.description,
        "is_private": repo.is_private,
        "language": repo.language,
        "stars": repo.stars,
        "updated_at": repo.updated_at,
        "total_commits": len(commits),
        "open_prs": open_prs,
        "merged_prs": merged_prs,
        "closed_prs": closed_prs,
        "total_prs": len(prs),
        "open_issues": open_issues,
        "closed_issues": closed_issues,
        "total_issues": len(issues),
        "metrics": {
            "health_score": metric.health_score,
            "activity_score": metric.activity_score,
            "maintenance_score": metric.maintenance_score,
            "documentation_score": metric.documentation_score,
            "merge_rate": metric.merge_rate,
            "issue_resolution_rate": metric.issue_resolution_rate,
        },
        "languages": languages_out,
        "top_contributors": [
            {"login": c.login, "contributions": c.contributions} for c in contributors
        ],
        "recent_commits": recent_commits,
    }

@router.post("/sync", response_model=SyncQueued, status_code=202)
def queue_sync(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not user.github_account:
        raise HTTPException(409, "No linked GitHub account")
    job = SyncJob(user_id=user.id, status="queued"); db.add(job); db.commit(); db.refresh(job)
    sync_repositories.delay(job.id)
    return SyncQueued(job_id=job.id, status=job.status)

