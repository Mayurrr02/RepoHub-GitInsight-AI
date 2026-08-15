from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

# Prometheus Metrics Registry for RepoHub

http_requests_total = Counter(
    "repohub_http_requests_total",
    "Total HTTP Requests handled by RepoHub API",
    ["method", "endpoint", "status"]
)

http_request_duration_seconds = Histogram(
    "repohub_http_request_duration_seconds",
    "HTTP Request Latency in seconds",
    ["method", "endpoint"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

active_websockets = Gauge(
    "repohub_active_websockets",
    "Current active WebSocket client connections"
)

sync_jobs_total = Counter(
    "repohub_sync_jobs_total",
    "Total repository sync jobs triggered",
    ["status"]
)

celery_task_duration_seconds = Histogram(
    "repohub_celery_task_duration_seconds",
    "Duration of asynchronous Celery tasks in seconds",
    ["task_name"]
)

audit_events_total = Counter(
    "repohub_audit_events_total",
    "Total security and administrative audit events recorded",
    ["action"]
)

organization_count = Gauge(
    "repohub_organizations_total",
    "Total number of active organizations"
)


def get_prometheus_metrics() -> tuple[bytes, str]:
    """Return latest prometheus metrics payload and content-type."""
    return generate_latest(), CONTENT_TYPE_LATEST
