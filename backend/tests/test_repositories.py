from datetime import datetime, timezone
from app.core.security import create_access_token
from app.models import Commit, Contributor, Language, PullRequest, Repository, User

def headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}

def test_lists_only_current_users_repositories(client, db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None)
    other = User(github_id=2, login="other", name=None, avatar_url=None)
    db.add_all([user, other]); db.flush()
    db.add_all([Repository(user_id=user.id, github_id=1, name="mine", full_name="octo/mine", html_url="https://github.com/octo/mine", description=None, is_private=False, language="Python", stars=2, updated_at=None), Repository(user_id=other.id, github_id=2, name="theirs", full_name="other/theirs", html_url="https://github.com/other/theirs", description=None, is_private=False, language=None, stars=0, updated_at=None)])
    db.commit()
    response = client.get("/api/v1/repositories", headers=headers(user))
    assert response.status_code == 200 and [repo["name"] for repo in response.json()] == ["mine"]

def test_get_repository_detail(client, db):
    user = User(github_id=10, login="octo2", name="Octo", avatar_url=None)
    db.add(user); db.flush()
    repo = Repository(user_id=user.id, github_id=101, name="deep-repo", full_name="octo2/deep-repo", html_url="https://github.com/octo2/deep-repo", description="A deep analysis repo", is_private=False, language="TypeScript", stars=42, updated_at=datetime.now(timezone.utc))
    db.add(repo); db.flush()

    now = datetime.now(timezone.utc)
    db.add_all([
        Commit(repository_id=repo.id, sha="sha1", author_login="octo2", message="feat: awesome feature", committed_at=now),
        PullRequest(repository_id=repo.id, github_id=1, number=1, author_login="octo2", state="closed", created_at=now, merged_at=now, closed_at=now),
        Contributor(repository_id=repo.id, github_id=1, login="octo2", contributions=25),
        Language(repository_id=repo.id, name="TypeScript", bytes=8000),
        Language(repository_id=repo.id, name="CSS", bytes=2000),
    ])
    db.commit()

    res = client.get(f"/api/v1/repositories/{repo.id}", headers=headers(user))
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "deep-repo"
    assert data["total_commits"] == 1
    assert data["merged_prs"] == 1
    assert data["languages"][0]["name"] == "TypeScript"
    assert data["languages"][0]["percent"] == 80.0
    assert len(data["top_contributors"]) == 1
    assert data["metrics"]["health_score"] > 0

def test_get_repository_detail_unauthorized_or_missing(client, db):
    user1 = User(github_id=20, login="u1", name=None, avatar_url=None)
    user2 = User(github_id=21, login="u2", name=None, avatar_url=None)
    db.add_all([user1, user2]); db.flush()
    repo = Repository(user_id=user1.id, github_id=201, name="secret", full_name="u1/secret", html_url="https://github.com/u1/secret", description=None, is_private=True, language="Go", stars=0, updated_at=None)
    db.add(repo); db.commit()

    # user2 tries to access user1's repo
    res = client.get(f"/api/v1/repositories/{repo.id}", headers=headers(user2))
    assert res.status_code == 404

def test_sync_requires_linked_account(client, db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None)
    db.add(user); db.commit()
    assert client.post("/api/v1/repositories/sync", headers=headers(user)).status_code == 409

