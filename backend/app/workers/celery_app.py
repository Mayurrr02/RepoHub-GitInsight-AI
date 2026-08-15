from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("repo_hub", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_track_started = True
celery_app.conf.imports = ("app.workers.tasks",)

if settings.redis_url.startswith("rediss://"):
    broker_ssl = {"ssl_cert_reqs": None}
    celery_app.conf.broker_use_ssl = broker_ssl
    celery_app.conf.redis_backend_use_ssl = broker_ssl
