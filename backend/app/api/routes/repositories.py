from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import GitHubAccount, Repository, SyncJob, User
from app.schemas.schemas import RepositoryOut, SyncQueued
from app.workers.tasks import sync_repositories

router = APIRouter(prefix="/repositories", tags=["Repositories"])

@router.get("", response_model=list[RepositoryOut])
def list_repositories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Repository).where(Repository.user_id == user.id).order_by(Repository.updated_at.desc())).all()

@router.post("/sync", response_model=SyncQueued, status_code=202)
def queue_sync(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not user.github_account:
        raise HTTPException(409, "No linked GitHub account")
    job = SyncJob(user_id=user.id, status="queued"); db.add(job); db.commit(); db.refresh(job)
    sync_repositories.delay(job.id)
    return SyncQueued(job_id=job.id, status=job.status)
