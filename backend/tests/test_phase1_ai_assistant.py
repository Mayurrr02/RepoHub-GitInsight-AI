import pytest
from app.core.security import create_access_token
from app.models import CodeChunk, Commit, Repository, User


def auth_header(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.mark.asyncio
async def test_ai_chat_with_repository_and_grounding(client, db):
    user = User(github_id=70, login="ai-architect", name="Architect", avatar_url=None)
    db.add(user)
    db.flush()

    repo = Repository(
        user_id=user.id,
        github_id=7001,
        name="platform",
        full_name="ai-architect/platform",
        html_url="https://github.com/ai-architect/platform",
        default_branch="main",
        description="Scalable engineering platform",
    )
    db.add(repo)
    db.flush()

    # Add code chunk
    chunk = CodeChunk(
        repository_id=repo.id,
        commit_sha="sha-arch-01",
        file_path="backend/app/auth.py",
        start_line=1,
        end_line=25,
        language="python",
        chunk_type="function",
        name="verify_jwt_token",
        content_hash="hash-123",
        content="def verify_jwt_token(token: str):\n    # JWT verification logic\n    return {'sub': 'user'}",
    )
    db.add(chunk)

    # Add commit
    from datetime import datetime, timezone
    commit = Commit(
        repository_id=repo.id,
        sha="sha-arch-01",
        author_login="ai-architect",
        message="feat(auth): add secure JWT token verifier",
        committed_at=datetime.now(timezone.utc),
    )
    db.add(commit)
    db.commit()

    # Ask question targeting this repository
    payload = {
        "question": "How is authentication handled in this repository?",
        "repository_id": repo.id,
    }
    resp = client.post("/api/v1/ai/chat", json=payload, headers=auth_header(user))
    assert resp.status_code == 200
    data = resp.json()

    assert "answer" in data
    assert "conversation_id" in data
    assert data["conversation_id"] > 0
    assert len(data["grounded_references"]) > 0

    # Verify at least one tool executed (search_code or get_repository_overview)
    assert len(data["tool_executions"]) > 0
    tool_names = [t["tool_name"] for t in data["tool_executions"]]
    assert "search_code" in tool_names or "get_repository_overview" in tool_names

    conv_id = data["conversation_id"]

    # Test listing conversations
    list_resp = client.get(f"/api/v1/ai/conversations?repository_id={repo.id}", headers=auth_header(user))
    assert list_resp.status_code == 200
    conv_list = list_resp.json()
    assert len(conv_list) >= 1
    assert conv_list[0]["id"] == conv_id

    # Test retrieving conversation detail
    detail_resp = client.get(f"/api/v1/ai/conversations/{conv_id}", headers=auth_header(user))
    assert detail_resp.status_code == 200
    conv_detail = detail_resp.json()
    assert len(conv_detail["messages"]) == 2  # 1 user + 1 assistant
    assert conv_detail["messages"][0]["role"] == "user"
    assert conv_detail["messages"][1]["role"] == "assistant"

    # Test deleting conversation
    del_resp = client.delete(f"/api/v1/ai/conversations/{conv_id}", headers=auth_header(user))
    assert del_resp.status_code == 204

    # Verify conversation is gone
    check_resp = client.get(f"/api/v1/ai/conversations/{conv_id}", headers=auth_header(user))
    assert check_resp.status_code == 404
