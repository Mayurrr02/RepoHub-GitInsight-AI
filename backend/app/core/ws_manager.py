import asyncio
import json
import logging
import ssl
from collections import defaultdict
from typing import Any
from fastapi import WebSocket
from redis.asyncio import Redis
import redis.asyncio as aioredis
from app.core.config import get_settings
from app.core.metrics import active_websockets

logger = logging.getLogger("repohub.websocket")
REDIS_EVENT_CHANNEL = "repohub:events"


class WebSocketManager:
    def __init__(self):
        # Maps user_id -> set of active WebSockets
        self.active_connections: dict[int, set[WebSocket]] = defaultdict(set)
        # Maps org_id -> set of active user_ids subscribed
        self.org_subscriptions: dict[int, set[int]] = defaultdict(set)
        self._redis_client: Redis | None = None
        self._pubsub_task: asyncio.Task | None = None
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id].add(websocket)
        total_connections = sum(len(conns) for conns in self.active_connections.values())
        active_websockets.set(total_connections)
        logger.info(f"WebSocket connected for user_id={user_id}. Total active: {total_connections}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

        total_connections = sum(len(conns) for conns in self.active_connections.values())
        active_websockets.set(total_connections)
        logger.info(f"WebSocket disconnected for user_id={user_id}. Total active: {total_connections}")

    async def send_to_user(self, user_id: int, message: dict[str, Any]):
        connections = self.active_connections.get(user_id, set()).copy()
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send WS message to user {user_id}: {e}")
                self.disconnect(ws, user_id)

    async def broadcast_to_org(self, org_id: int, message: dict[str, Any], user_ids: list[int] | None = None):
        if user_ids:
            for uid in user_ids:
                await self.send_to_user(uid, message)
        else:
            # Broadcast to all connected users
            for uid in list(self.active_connections.keys()):
                await self.send_to_user(uid, message)

    async def start_redis_listener(self):
        """Subscribe to Redis pub/sub channel to distribute messages across instances with auto-reconnect."""
        settings = get_settings()
        while True:
            try:
                kwargs: dict[str, Any] = {"decode_responses": True, "socket_timeout": 30}
                if settings.redis_url.startswith("rediss://"):
                    kwargs["ssl_cert_reqs"] = ssl.CERT_NONE

                self._redis_client = aioredis.from_url(settings.redis_url, **kwargs)
                pubsub = self._redis_client.pubsub()
                await pubsub.subscribe(REDIS_EVENT_CHANNEL)
                logger.info(f"Subscribed to Redis channel '{REDIS_EVENT_CHANNEL}'")

                async for msg in pubsub.listen():
                    if msg["type"] == "message":
                        try:
                            payload = json.loads(msg["data"])
                            target_user_id = payload.get("user_id")
                            target_org_id = payload.get("org_id")

                            if target_user_id:
                                await self.send_to_user(int(target_user_id), payload)
                            elif target_org_id:
                                await self.broadcast_to_org(int(target_org_id), payload)
                            else:
                                for uid in list(self.active_connections.keys()):
                                    await self.send_to_user(uid, payload)
                        except Exception as exc:
                            logger.error(f"Error processing Redis pub/sub message: {exc}")
            except asyncio.CancelledError:
                logger.info("Redis listener task cancelled.")
                break
            except Exception as exc:
                logger.warning(f"Redis pub/sub connection interrupted: {exc}. Retrying in 5s...")
                await asyncio.sleep(5)

    def start_background_task(self):
        if not self._pubsub_task or self._pubsub_task.done():
            self._pubsub_task = asyncio.create_task(self.start_redis_listener())

    async def stop_background_task(self):
        if self._pubsub_task:
            self._pubsub_task.cancel()
        if self._redis_client:
            await self._redis_client.close()


ws_manager = WebSocketManager()


def publish_realtime_event(
    event: str,
    data: dict[str, Any],
    user_id: int | None = None,
    org_id: int | None = None
) -> None:
    """
    Publish event to in-memory WebSockets and Redis pub/sub channel for reliable delivery.
    Synchronous helper usable from Celery workers, background threads, and API endpoints.
    """
    settings = get_settings()
    payload = {
        "event": event,
        "data": data,
        "user_id": user_id,
        "org_id": org_id,
    }

    # 1. Direct in-memory threadsafe dispatch if main FastAPI event loop is running
    target_loop = ws_manager.loop
    if not target_loop:
        try:
            target_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

    if target_loop and target_loop.is_running():
        try:
            if user_id:
                asyncio.run_coroutine_threadsafe(ws_manager.send_to_user(user_id, payload), target_loop)
            elif org_id:
                asyncio.run_coroutine_threadsafe(ws_manager.broadcast_to_org(org_id, payload), target_loop)
            else:
                for uid in list(ws_manager.active_connections.keys()):
                    asyncio.run_coroutine_threadsafe(ws_manager.send_to_user(uid, payload), target_loop)
        except Exception as e:
            logger.debug(f"Direct threadsafe WS delivery: {e}")

    # 2. Multi-instance distributed delivery via Redis Pub/Sub
    try:
        import redis
        kwargs: dict[str, Any] = {"socket_timeout": 3, "socket_connect_timeout": 3}
        if settings.redis_url.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = ssl.CERT_NONE

        client = redis.from_url(settings.redis_url, **kwargs)
        client.publish(REDIS_EVENT_CHANNEL, json.dumps(payload))
        client.close()
    except Exception as exc:
        logger.debug(f"Redis publish omitted or failed: {exc}")

