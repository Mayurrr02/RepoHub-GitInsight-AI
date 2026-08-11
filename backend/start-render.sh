#!/bin/sh
# Run the API and its Celery worker in one free Render web service.
# This is suitable for a portfolio/demo deployment. Scale them into separate
# services before using the application for production workloads.
set -eu

cleanup() {
  if [ -n "${worker_pid:-}" ]; then
    kill "$worker_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

alembic upgrade head
celery -A app.workers.celery_app worker --loglevel=INFO &
worker_pid=$!

uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
