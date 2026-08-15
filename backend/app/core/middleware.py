import logging
import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.core.metrics import http_request_duration_seconds, http_requests_total

logger = logging.getLogger("repohub.access")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        response: Response = await call_next(request)
        headers = response.headers
        headers["X-Content-Type-Options"] = "nosniff"
        headers["X-Frame-Options"] = "DENY"
        headers["X-XSS-Protection"] = "1; mode=block"
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https: blob:; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "connect-src 'self' ws: wss: http: https:;"
        )
        return response


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        start_time = time.time()
        path = request.url.path
        method = request.method
        request_id = getattr(request.state, "request_id", "-")

        # Skip prometheus tracking for /metrics and /health/live to avoid self-pollution
        skip_metrics = path in ("/metrics", "/health/live")

        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            raise
        finally:
            duration = time.time() - start_time
            latency_ms = round(duration * 1000, 2)

            if not skip_metrics:
                normalized_path = path
                if path.startswith("/api/v1/organizations/"):
                    parts = path.split("/")
                    if len(parts) >= 5:
                        parts[4] = "{id}"
                    normalized_path = "/".join(parts)

                http_requests_total.labels(
                    method=method,
                    endpoint=normalized_path,
                    status=str(status_code)
                ).inc()

                http_request_duration_seconds.labels(
                    method=method,
                    endpoint=normalized_path
                ).observe(duration)

            client_ip = request.client.host if request.client else "-"
            log_record = logging.LogRecord(
                name="repohub.access",
                level=logging.INFO,
                pathname="",
                lineno=0,
                msg=f"{method} {path} {status_code} ({latency_ms}ms)",
                args=(),
                exc_info=None
            )
            log_record.request_id = request_id
            log_record.method = method
            log_record.path = path
            log_record.status_code = status_code
            log_record.latency_ms = latency_ms
            log_record.client_ip = client_ip
            logger.handle(log_record)
