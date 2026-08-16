from app.core.security import create_access_token
from app.models import User

def test_ai_chat_explains_missing_configuration(client, db):
    user = User(github_id=1, login="octo", name=None, avatar_url=None); db.add(user); db.commit()
    response = client.post("/api/v1/ai/chat", json={"question": "What should I learn next?"}, headers={"Authorization": f"Bearer {create_access_token(user.id)}"})
    assert response.status_code == 200
    assert "GEMINI_API_KEY" in response.json()["answer"]

def test_ai_report_is_a_pdf(client, db):
    user = User(github_id=2, login="octo2", name=None, avatar_url=None); db.add(user); db.commit()
    response = client.post("/api/v1/ai/report", headers={"Authorization": f"Bearer {create_access_token(user.id)}"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
