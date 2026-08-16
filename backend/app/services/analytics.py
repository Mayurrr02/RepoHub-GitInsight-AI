from collections import Counter
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models import Commit, DeveloperMetric, Issue, Language, PullRequest, Repository, RepositoryMetric, Review, User


def _score(value: float) -> float:
    return round(max(0, min(100, value)), 1)


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def calculate_repository_metrics(db: Session, repository: Repository) -> RepositoryMetric:
    commits = db.scalars(select(Commit).where(Commit.repository_id == repository.id)).all()
    prs = db.scalars(select(PullRequest).where(PullRequest.repository_id == repository.id)).all()
    issues = db.scalars(select(Issue).where(Issue.repository_id == repository.id)).all()
    valid_commits = [c for c in commits if c.committed_at is not None]
    days_active = len({c.committed_at.date() for c in valid_commits})
    merge_rate = 100 * sum(pr.merged_at is not None for pr in prs) / len(prs) if prs else 0
    issue_rate = 100 * sum(issue.closed_at is not None for issue in issues) / len(issues) if issues else 0
    now = datetime.now(timezone.utc)
    active_30d = sum(_to_utc(c.committed_at) >= now - timedelta(days=30) for c in valid_commits)
    activity = _score(active_30d * 4 + days_active * 1.5)
    documentation = 100 if repository.description else 35
    maintenance = _score(issue_rate * .45 + merge_rate * .35 + min(active_30d * 2, 20))
    health = _score(activity * .35 + documentation * .2 + maintenance * .25 + merge_rate * .1 + issue_rate * .1)
    metric = db.scalar(select(RepositoryMetric).where(RepositoryMetric.repository_id == repository.id))
    if not metric:
        metric = RepositoryMetric(repository_id=repository.id)
        db.add(metric)
        db.flush()

    metric.merge_rate, metric.issue_resolution_rate, metric.activity_score = round(merge_rate, 1), round(issue_rate, 1), activity
    metric.documentation_score, metric.maintenance_score, metric.health_score = documentation, maintenance, health
    metric.calculated_at = now
    return metric


def calculate_developer_metrics(db: Session, user_id: int) -> DeveloperMetric:
    commits = db.scalars(select(Commit).join(Repository).where(Repository.user_id == user_id)).all()
    user = db.get(User, user_id)
    user_login = user.login.lower() if (user and user.login) else None

    if user_login:
        own_commits = [c for c in commits if c.author_login and c.author_login.lower() == user_login]
        if not own_commits:
            own_commits = commits
    else:
        own_commits = commits

    valid_commits = [c for c in own_commits if c.committed_at is not None]
    dates = sorted({c.committed_at.date() for c in valid_commits}, reverse=True)
    streak = 0
    expected = datetime.now(timezone.utc).date()
    for day in dates:
        if day == expected or (streak == 0 and day == expected - timedelta(days=1)):
            streak += 1
            expected = day - timedelta(days=1)
        elif day < expected:
            break

    span = max(1, (datetime.now(timezone.utc).date() - dates[-1]).days + 1) if dates else 1
    reviews = []
    if user_login:
        reviews = db.scalars(
            select(Review)
            .join(PullRequest)
            .join(Repository)
            .where(
                Repository.user_id == user_id,
                func.lower(Review.reviewer_login) == user_login
            )
        ).all()

    weekend = (
        100 * sum(c.committed_at.weekday() >= 5 for c in valid_commits) / len(valid_commits)
        if valid_commits
        else 0
    )

    metric = db.scalar(select(DeveloperMetric).where(DeveloperMetric.user_id == user_id))
    if not metric:
        metric = DeveloperMetric(user_id=user_id)
        db.add(metric)
        db.flush()

    metric.commit_frequency = round(len(valid_commits) / max(1, len(dates)), 2) if dates else 0
    metric.average_commits_per_day = round(len(valid_commits) / span, 2) if valid_commits else 0
    metric.coding_streak = streak
    metric.weekend_activity = round(weekend, 1)
    metric.coding_hours = round(len(valid_commits) * 0.75, 1)
    metric.review_score = _score(len(reviews) * 8)
    metric.calculated_at = datetime.now(timezone.utc)
    return metric


def history(db: Session, user_id: int, days: int = 90) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(select(func.date(Commit.committed_at), func.count(Commit.id)).join(Repository).where(Repository.user_id == user_id, Commit.committed_at >= since).group_by(func.date(Commit.committed_at)).order_by(func.date(Commit.committed_at))).all()
    return [{"date": str(day), "commits": count} for day, count in rows]


def language_distribution(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(select(Language.name, func.sum(Language.bytes)).join(Repository).where(Repository.user_id == user_id).group_by(Language.name).order_by(func.sum(Language.bytes).desc())).all()
    total = sum(row[1] for row in rows) or 1
    return [{"name": name, "bytes": size, "percent": round(size * 100 / total, 1)} for name, size in rows]

