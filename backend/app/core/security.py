from datetime import datetime, timedelta, timezone
import jwt
from fastapi import HTTPException, status
from app.core.config import get_settings


def create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    payload = {"sub": subject, "type": token_type, "exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, get_settings().jwt_secret_key, algorithm="HS256")


def create_access_token(user_id: int) -> str:
    s = get_settings()
    return create_token(str(user_id), "access", timedelta(minutes=s.jwt_access_token_expire_minutes))


def create_refresh_token(user_id: int) -> str:
    s = get_settings()
    return create_token(str(user_id), "refresh", timedelta(days=s.jwt_refresh_token_expire_days))


def decode_token(token: str, expected_type: str) -> int:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret_key, algorithms=["HS256"])
        if payload.get("type") != expected_type:
            raise ValueError("wrong token type")
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc
