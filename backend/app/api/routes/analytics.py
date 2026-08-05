from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import DeveloperMetric, Repository, RepositoryMetric, User
from app.services.analytics import calculate_developer_metrics, calculate_repository_metrics, history, language_distribution

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/developer")
def developer(user: User = Depends(current_user), db: Session = Depends(get_db)):
    metric = db.scalar(select(DeveloperMetric).where(DeveloperMetric.user_id == user.id)) or calculate_developer_metrics(db, user.id)
    db.commit()
    return {"commit_frequency": metric.commit_frequency, "coding_streak": metric.coding_streak, "average_commits_per_day": metric.average_commits_per_day, "coding_hours": metric.coding_hours, "weekend_activity": metric.weekend_activity, "review_score": metric.review_score, "languages": language_distribution(db, user.id)}

@router.get("/repository")
def repository_metrics(repository_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Repository).where(Repository.user_id == user.id)
    if repository_id: query = query.where(Repository.id == repository_id)
    repos = db.scalars(query).all()
    result = []
    for repo in repos:
        metric = db.scalar(select(RepositoryMetric).where(RepositoryMetric.repository_id == repo.id)) or calculate_repository_metrics(db, repo)
        result.append({"repository_id": repo.id, "name": repo.full_name, "merge_rate": metric.merge_rate, "issue_resolution_rate": metric.issue_resolution_rate, "health_score": metric.health_score, "activity_score": metric.activity_score, "documentation_score": metric.documentation_score, "maintenance_score": metric.maintenance_score})
    db.commit(); return result

@router.get("/team")
def team(user: User = Depends(current_user), db: Session = Depends(get_db)):
    # The MVP's team is the authenticated user's connected repositories.
    return {"repositories": db.scalar(select(func.count(Repository.id)).where(Repository.user_id == user.id)), "developer": developer(user, db)}

@router.get("/history")
def analytics_history(days: int = Query(default=90, ge=7, le=365), user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"commits": history(db, user.id, days), "languages": language_distribution(db, user.id)}
