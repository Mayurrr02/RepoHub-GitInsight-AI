import logging
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from app.core.security import decode_token
from app.core.ws_manager import ws_manager
from app.db.session import SessionLocal
from app.models.models import User

logger = logging.getLogger("repohub.ws_route")
router = APIRouter(tags=["Real-time WebSockets"])


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None)
):
    # Authenticate token from query param
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
        return

    try:
        user_id = decode_token(token, "access")
    except Exception as exc:
        logger.warning(f"Invalid WebSocket token: {exc}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid auth token")
        return

    # Verify user exists
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found")
            return
    finally:
        db.close()

    await ws_manager.connect(websocket, user_id)
    try:
        # Send initial connected greeting
        await websocket.send_json({
            "event": "connected",
            "data": {
                "message": f"Connected to RepoHub Live Stream as @{user.login}",
                "user_id": user_id
            }
        })

        while True:
            # Keep-alive / handle client ping or client subscription
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.warning(f"WebSocket exception for user {user_id}: {e}")
        ws_manager.disconnect(websocket, user_id)
