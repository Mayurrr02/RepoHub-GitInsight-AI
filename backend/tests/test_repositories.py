from app.core.security import create_access_token
from app.models import Repository, User

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

def test_sync_requires_linked_account(client, db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None)
    db.add(user); db.commit()
    assert client.post("/api/v1/repositories/sync", headers=headers(user)).status_code == 409
