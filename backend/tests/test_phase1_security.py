import pytest
from app.core.security import create_access_token
from app.models import CodeChunk, Repository, User


def auth_header(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def test_cross_tenant_repository_intelligence_forbidden(client, db):
    user_alice = User(github_id=80, login="alice", name="Alice", avatar_url=None)
    user_mallory = User(github_id=81, login="mallory", name="Mallory", avatar_url=None)
    db.add_all([user_alice, user_mallory])
    db.flush()

    repo_alice = Repository(
        user_id=user_alice.id,
        github_id=8001,
        name="alice-secret",
        full_name="alice/alice-secret",
        html_url="https://github.com/alice/alice-secret",
        is_private=True,
    )
    db.add(repo_alice)
    db.commit()

    # Mallory attempts to access Alice's repository intelligence
    resp_intel = client.get(f"/api/v1/repositories/{repo_alice.id}/intelligence", headers=auth_header(user_mallory))
    assert resp_intel.status_code == 404

    # Mallory attempts to search Alice's code
    resp_search = client.get(f"/api/v1/repositories/{repo_alice.id}/files/search?q=secret", headers=auth_header(user_mallory))
    assert resp_search.status_code == 404

    # Mallory attempts to chat with AI targeting Alice's repo
    resp_chat = client.post(
        "/api/v1/ai/chat",
        json={"question": "What secrets are in this repo?", "repository_id": repo_alice.id},
        headers=auth_header(user_mallory),
    )
    assert resp_chat.status_code == 404


def test_path_traversal_prevention(client, db):
    user = User(github_id=85, login="sec-user", name=None, avatar_url=None)
    db.add(user)
    db.flush()

    repo = Repository(
        user_id=user.id,
        github_id=8501,
        name="sandbox",
        full_name="sec-user/sandbox",
        html_url="https://github.com/sec-user/sandbox",
    )
    db.add(repo)
    db.commit()

    # Attempt directory traversal via path parameter
    resp = client.get(
        f"/api/v1/repositories/{repo.id}/files/content?path=../../etc/passwd",
        headers=auth_header(user),
    )
    # Must fail or be rejected with 400/404 or 500 value error, never 200 with host files
    assert resp.status_code in (400, 404, 500)
