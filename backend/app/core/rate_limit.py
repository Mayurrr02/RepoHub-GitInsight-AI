import time
from collections import defaultdict
from threading import Lock
from typing import Callable
from fastapi import HTTPException, Request, Response, status


class MemoryRateLimiter:
    def __init__(self):
        self._requests = defaultdict(list)
        self._lock = Lock()

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int, int]:
        now = time.time()
        window_start = now - window_seconds

        with self._lock:
            # Clean expired timestamps
            timestamps = [t for t in self._requests[key] if t > window_start]
            self._requests[key] = timestamps

            count = len(timestamps)
            if count >= max_requests:
                oldest = timestamps[0] if timestamps else now
                reset_after = int(max(1, oldest + window_seconds - now))
                return False, 0, reset_after

            self._requests[key].append(now)
            remaining = max_requests - (count + 1)
            return True, remaining, window_seconds


limiter = MemoryRateLimiter()


def rate_limit(
    max_requests: int = 60,
    window_seconds: int = 60,
    key_func: Callable[[Request], str] | None = None
):
    """
    FastAPI dependency for endpoint rate limiting.
    Emits X-RateLimit headers and enforces limits.
    """
    async def dependency(request: Request, response: Response):
        if key_func:
            client_key = key_func(request)
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"
            # If user is authenticated, use their token/user identity, otherwise client IP
            auth = request.headers.get("authorization", "")
            client_key = f"{client_ip}:{request.url.path}:{auth[:20]}"

        allowed, remaining, reset_after = limiter.is_allowed(
            key=client_key,
            max_requests=max_requests,
            window_seconds=window_seconds
        )

        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_after)

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {reset_after} seconds.",
                headers={"Retry-After": str(reset_after)}
            )
        return True

    return dependency
