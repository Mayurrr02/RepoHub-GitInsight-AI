from celery import Celery
from app.core.config import get_settings

celery_app = Celery("repo_hub", broker=get_settings().redis_url, backend=get_settings().redis_url)
celery_app.conf.task_track_started = True
celery_app.conf.imports = ("app.workers.tasks",)
