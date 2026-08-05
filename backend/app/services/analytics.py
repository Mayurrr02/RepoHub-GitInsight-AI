from collections import Counter
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models import Commit, DeveloperMetric, Issue, Language, PullRequest, Repository, RepositoryMetric, Review, User


def _score(value: float) -> float:
    return round(max(0, min(100, value)), 1)


def calculate_repository_metrics(db: Session, repository: Repository) -> RepositoryMetric:
    commits = db.scalars(select(Commit).where(Commit.repository_id == repository.id)).all()
    prs = db.scalars(select(PullRequest).where(PullRequest.repository_id == repository.id)).all()
    issues = db.scalars(select(Issue).where(Issue.repository_id == repository.id)).all()
    days_active = len({commit.committed_at.date() for commit in commits})
    merge_rate = 100 * sum(pr.merged_at is not None for pr in prs) / len(prs) if prs else 0
    issue_rate = 100 * sum(issue.closed_at is not None for issue in issues) / len(issues) if issues else 0
    now = datetime.now(timezone.utc)
    active_30d = sum(commit.committed_at >= now - timedelta(days=30) for commit in commits)
    activity = _score(active_30d * 4 + days_active * 1.5)
    documentation = 100 if repository.description else 35
    maintenance = _score(issue_rate * .45 + merge_rate * .35 + min(active_30d * 2, 20))
    health = _score(activity * .35 + documentation * .2 + maintenance * .25 + merge_rate * .1 + issue_rate * .1)
    metric = db.scalar(select(RepositoryMetric).where(RepositoryMetric.repository_id == repository.id)) or RepositoryMetric(repository_id=repository.id)
    metric.merge_rate, metric.issue_resolution_rate, metric.activity_score = round(merge_rate, 1), round(issue_rate, 1), activity
    metric.documentation_score, metric.maintenance_score, metric.health_score = documentation, maintenance, health
    metric.calculated_at = now
    db.add(metric)
    return metric


def calculate_developer_metrics(db: Session, user_id: int) -> DeveloperMetric:
    commits = db.scalars(select(Commit).join(Repository).where(Repository.user_id == user_id)).all()
    user = db.get(User, user_id)
    own_commits = [c for c in commits if c.author_login == user.login] or commits
    dates = sorted({commit.committed_at.date() for commit in own_commits}, reverse=True)
    streak = 0
    expected = datetime.now(timezone.utc).date()
    for day in dates:
        if day == expected or (streak == 0 and day == expected - timedelta(days=1)):
            streak += 1; expected = day - timedelta(days=1)
        else: break
    span = max(1, (datetime.now(timezone.utc).date() - dates[-1]).days + 1) if dates else 1
    reviews = db.scalars(select(Review).join(PullRequest).join(Repository).where(Repository.user_id == user_id, Review.reviewer_login == user.login)).all()
    weekend = 100 * sum(c.committed_at.weekday() >= 5 for c in own_commits) / len(own_commits) if own_commits else 0
    metric = db.scalar(select(DeveloperMetric).where(DeveloperMetric.user_id == user_id)) or DeveloperMetric(user_id=user_id)
    metric.commit_frequency = round(len(own_commits) / max(1, len(dates)), 2)
    metric.average_commits_per_day = round(len(own_commits) / span, 2)
    metric.coding_streak, metric.weekend_activity = streak, round(weekend, 1)
    metric.coding_hours = round(len(own_commits) * 0.75, 1)
    metric.review_score, metric.calculated_at = _score(len(reviews) * 8), datetime.now(timezone.utc)
    db.add(metric)
    return metric


def history(db: Session, user_id: int, days: int = 90) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(select(func.date(Commit.committed_at), func.count(Commit.id)).join(Repository).where(Repository.user_id == user_id, Commit.committed_at >= since).group_by(func.date(Commit.committed_at)).order_by(func.date(Commit.committed_at))).all()
    return [{"date": str(day), "commits": count} for day, count in rows]


def language_distribution(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(select(Language.name, func.sum(Language.bytes)).join(Repository).where(Repository.user_id == user_id).group_by(Language.name).order_by(func.sum(Language.bytes).desc())).all()
    total = sum(row[1] for row in rows) or 1
    return [{"name": name, "bytes": size, "percent": round(size * 100 / total, 1)} for name, size in rows]
