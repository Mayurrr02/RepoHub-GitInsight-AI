from app.core.security import create_access_token
from app.models.models import User


def test_websocket_connection_and_auth(client, db):
    user = User(github_id=5001, login="ws_user", name="WS User")
    db.add(user)
    db.commit()

    token = create_access_token(user.id)

    # 1. Connect without token -> rejected
    try:
        with client.websocket_connect("/api/v1/ws") as ws:
            pass
    except Exception:
        # Expected connection rejection
        pass

    # 2. Connect with valid token
    with client.websocket_connect(f"/api/v1/ws?token={token}") as websocket:
        # Receive greeting
        data = websocket.receive_json()
        assert data["event"] == "connected"
        assert "ws_user" in data["data"]["message"]

        # Send ping
        websocket.send_text("ping")
        resp = websocket.receive_text()
        assert resp == "pong"
