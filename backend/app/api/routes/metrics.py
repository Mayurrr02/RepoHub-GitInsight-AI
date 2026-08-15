from fastapi import APIRouter, Response
from app.core.metrics import get_prometheus_metrics

router = APIRouter(tags=["Metrics"])


@router.get("/metrics")
def prometheus_metrics():
    """Prometheus Scrape Endpoint."""
    payload, content_type = get_prometheus_metrics()
    return Response(content=payload, media_type=content_type)
