#!/bin/sh
# Startup script for RepoHub on Railway
# 1. Runs Alembic database migrations
# 2. Spawns Celery background worker
# 3. Boots FastAPI Uvicorn server on dynamic ${PORT}
set -eu

cleanup() {
  if [ -n "${worker_pid:-}" ]; then
    echo "Shutting down Celery worker (PID: $worker_pid)..."
    kill "$worker_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

export C_FORCE_ROOT=1

echo "==> Running database migrations with Alembic..."
alembic upgrade head

echo "==> Starting Celery worker in the background (concurrency=${CELERY_CONCURRENCY:-2})..."
celery -A app.workers.celery_app worker --loglevel=INFO --concurrency="${CELERY_CONCURRENCY:-2}" &
worker_pid=$!

echo "==> Starting FastAPI Uvicorn server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
