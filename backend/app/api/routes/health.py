import time
from datetime import datetime, timezone
from fastapi import APIRouter, Response, status
from sqlalchemy import text
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.schemas.schemas import HealthComponentStatus, HealthResponse

router = APIRouter(tags=["Health & Observability"])


@router.get("/health", response_model=HealthResponse)
def comprehensive_health(response: Response):
    settings = get_settings()
    components: dict[str, HealthComponentStatus] = {}
    overall_status = "healthy"

    # 1. Database Check
    db_start = time.time()
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_latency = round((time.time() - db_start) * 1000, 2)
        components["database"] = HealthComponentStatus(
            status="ok",
            details="Connected to PostgreSQL / SQLite database",
            latency_ms=db_latency
        )
    except Exception as exc:
        overall_status = "unhealthy"
        components["database"] = HealthComponentStatus(
            status="error",
            details=str(exc)
        )

    # 2. Redis Check
    redis_start = time.time()
    try:
        import redis
        kwargs = {"socket_timeout": 2}
        if settings.redis_url.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = None

        client = redis.from_url(settings.redis_url, **kwargs)
        client.ping()
        client.close()
        redis_latency = round((time.time() - redis_start) * 1000, 2)
        components["redis"] = HealthComponentStatus(
            status="ok",
            details="Connected to Redis broker and cache",
            latency_ms=redis_latency
        )
    except Exception as exc:
        if overall_status == "healthy":
            overall_status = "degraded"
        components["redis"] = HealthComponentStatus(
            status="error",
            details=str(exc)
        )

    # 3. Celery Status Check
    try:
        from app.workers.celery_app import celery_app
        inspector = celery_app.control.inspect(timeout=1.0)
        ping_res = inspector.ping() if inspector else None
        if ping_res:
            components["celery_workers"] = HealthComponentStatus(
                status="ok",
                details=f"Active worker nodes: {list(ping_res.keys())}"
            )
        else:
            components["celery_workers"] = HealthComponentStatus(
                status="warning",
                details="No worker heartbeat response; tasks queued in Redis"
            )
    except Exception as exc:
        components["celery_workers"] = HealthComponentStatus(
            status="error",
            details=str(exc)
        )

    if overall_status == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": overall_status,
        "timestamp": datetime.now(timezone.utc),
        "version": "1.0.0",
        "environment": "production" if not settings.database_url.startswith("sqlite") else "development",
        "components": components
    }


@router.get("/health/live", status_code=status.HTTP_200_OK)
def liveness():
    """Kubernetes / Docker Liveness Probe."""
    return {"status": "live"}


@router.get("/health/ready")
def readiness(response: Response):
    """Kubernetes / Docker Readiness Probe."""
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ready"}
    except Exception as exc:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready", "error": str(exc)}
