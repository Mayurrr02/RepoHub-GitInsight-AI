from datetime import datetime, timedelta, timezone
from app.core.security import create_access_token
from app.models import Commit, DeveloperMetric, Issue, PullRequest, Repository, Review, User
from app.services.analytics import calculate_developer_metrics, calculate_repository_metrics

def test_calculates_repository_metrics(db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None); db.add(user); db.flush()
    repo = Repository(user_id=user.id, github_id=2, name="a", full_name="octo/a", html_url="https://example.com", description="documented", is_private=False, language="Python", stars=0, updated_at=None); db.add(repo); db.flush()
    db.add_all([PullRequest(repository_id=repo.id, github_id=1, number=1, author_login="octo", state="closed", created_at=datetime.now(timezone.utc), merged_at=datetime.now(timezone.utc), closed_at=datetime.now(timezone.utc)), Issue(repository_id=repo.id, github_id=1, state="closed", created_at=datetime.now(timezone.utc), closed_at=datetime.now(timezone.utc))]); db.commit()
    metric = calculate_repository_metrics(db, repo)
    assert metric.merge_rate == 100 and metric.issue_resolution_rate == 100 and metric.health_score > 0

def test_calculate_developer_metrics_case_insensitive_and_fallback(db):
    user = User(github_id=10, login="Mayurrr02", name="Mayur", avatar_url=None); db.add(user); db.flush()
    repo = Repository(user_id=user.id, github_id=20, name="repo1", full_name="Mayurrr02/repo1", html_url="https://example.com", description="test", is_private=False, language="Python", stars=5, updated_at=None); db.add(repo); db.flush()
    now = datetime.now(timezone.utc)
    # Add commits with lowercase author login, none author login, and multiple dates
    db.add_all([
        Commit(repository_id=repo.id, sha="c1", author_login="mayurrr02", message="feat: 1", committed_at=now),
        Commit(repository_id=repo.id, sha="c2", author_login="Mayurrr02", message="feat: 2", committed_at=now - timedelta(days=1)),
        Commit(repository_id=repo.id, sha="c3", author_login=None, message="feat: 3", committed_at=now - timedelta(days=2)),
        Commit(repository_id=repo.id, sha="c4", author_login="Mayurrr02", message="feat: 4", committed_at=now - timedelta(days=3)),
    ])
    pr = PullRequest(repository_id=repo.id, github_id=101, number=1, author_login="someone", state="open", created_at=now)
    db.add(pr); db.flush()
    db.add(Review(pull_request_id=pr.id, github_id=201, reviewer_login="MAYURRR02", state="APPROVED", submitted_at=now))
    db.commit()

    metric = calculate_developer_metrics(db, user.id)
    assert metric.coding_streak >= 2
    assert metric.coding_hours > 0
    assert metric.average_commits_per_day > 0
    assert metric.commit_frequency > 0
    assert metric.review_score > 0

def test_developer_analytics_recalculates_on_fetch(client, db):
    user = User(github_id=30, login="dev1", name=None, avatar_url=None); db.add(user); db.flush()
    repo = Repository(user_id=user.id, github_id=40, name="b", full_name="dev1/b", html_url="https://example.com", description=None, is_private=False, language=None, stars=0, updated_at=None); db.add(repo); db.flush()

    # Pre-create a 0-metric record (simulating visiting analytics before syncing)
    db.add(DeveloperMetric(user_id=user.id, commit_frequency=0, coding_streak=0, average_commits_per_day=0, coding_hours=0, weekend_activity=0, review_score=0))
    db.commit()

    # Now add a commit
    db.add(Commit(repository_id=repo.id, sha="sha123", author_login="dev1", message="initial commit", committed_at=datetime.now(timezone.utc)))
    db.commit()

    token = create_access_token(user.id)
    res = client.get("/api/v1/analytics/developer", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["coding_streak"] == 1
    assert data["coding_hours"] == 0.8
    assert data["average_commits_per_day"] == 1.0

