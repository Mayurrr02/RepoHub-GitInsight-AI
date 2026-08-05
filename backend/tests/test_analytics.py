from datetime import datetime, timedelta, timezone
from app.core.security import create_access_token
from app.models import Commit, Issue, PullRequest, Repository, User
from app.services.analytics import calculate_developer_metrics, calculate_repository_metrics

def test_calculates_repository_metrics(db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None); db.add(user); db.flush()
    repo = Repository(user_id=user.id, github_id=2, name="a", full_name="octo/a", html_url="https://example.com", description="documented", is_private=False, language="Python", stars=0, updated_at=None); db.add(repo); db.flush()
    db.add_all([PullRequest(repository_id=repo.id, github_id=1, number=1, author_login="octo", state="closed", created_at=datetime.now(timezone.utc), merged_at=datetime.now(timezone.utc), closed_at=datetime.now(timezone.utc)), Issue(repository_id=repo.id, github_id=1, state="closed", created_at=datetime.now(timezone.utc), closed_at=datetime.now(timezone.utc))]); db.commit()
    metric = calculate_repository_metrics(db, repo)
    assert metric.merge_rate == 100 and metric.issue_resolution_rate == 100 and metric.health_score > 0

def test_developer_analytics_endpoint(client, db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None); db.add(user); db.flush()
    repo = Repository(user_id=user.id, github_id=2, name="a", full_name="octo/a", html_url="https://example.com", description=None, is_private=False, language=None, stars=0, updated_at=None); db.add(repo); db.flush()
    db.add(Commit(repository_id=repo.id, sha="a", author_login="octo", message="work", committed_at=datetime.now(timezone.utc) - timedelta(days=1))); db.commit()
    assert client.get("/api/v1/analytics/developer", headers={"Authorization": f"Bearer {create_access_token(user.id)}"}).status_code == 200
