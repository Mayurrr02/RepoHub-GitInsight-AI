from app.core.security import create_refresh_token
from app.models import User

def test_refresh_returns_new_token(client, db):
    user = User(github_id=1, login="octo", name="Octo", avatar_url=None)
    db.add(user); db.commit()
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": create_refresh_token(user.id)})
    assert response.status_code == 200
    assert response.json()["access_token"]

def test_me_requires_authentication(client):
    assert client.get("/api/v1/users/me").status_code == 403
