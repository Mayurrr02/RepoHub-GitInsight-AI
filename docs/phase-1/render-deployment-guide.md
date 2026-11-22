# RepoHub Phase 1: Render Deployment Guide

## 1. Deployment Architecture

RepoHub is hosted on **Render**. In accordance with non-negotiable development rules, Phase 1 strictly preserves Render's single-service architecture without introducing separate microservices or requiring new cloud providers.

```
                      Render Web Service (Standard/Free Tier)
┌────────────────────────────────────────────────────────────────────────┐
│  Container Startup:                                                    │
│  1. `alembic upgrade head`                                             │
│  2. `celery -A app.workers.celery worker --loglevel=info` (background) │
│  3. `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (foreground)     │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
 Render Managed PostgreSQL                           Render Managed Redis
 (Persistent Relational + Chunks)                    (Celery Message Broker)
```

---

## 2. Startup Script (`start-render.sh`)

The entrypoint script handles database migrations and process orchestration within the single container:

```bash
#!/usr/bin/env bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting Celery worker in background..."
celery -A app.workers.celery worker --loglevel=info --concurrency=2 &

echo "Starting Uvicorn web server on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

### Redis Resiliency Fallback
If `REDIS_URL` is unreachable or unconfigured (such as during test deployments), Celery task dispatch automatically falls back to background daemon threads (`threading.Thread`), preventing worker crashes or dropped API requests.

---

## 3. Environment Variable Specification

The following variables must be configured in the Render Dashboard under **Environment**:

| Variable | Required | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes | PostgreSQL connection string provided by Render Managed PostgreSQL. |
| `SECRET_KEY` | Yes | Secret key for signing JWT user session tokens. |
| `GEMINI_API_KEY` | Yes | Google Gemini API key used for embeddings (`text-embedding-004`) and AI chat reasoning. |
| `GITHUB_WEBHOOK_SECRET`| Yes | Shared secret for validating GitHub webhook HMAC SHA-256 signatures. |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App Client ID for user login and repository connection. |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App Client Secret. |
| `REDIS_URL` | Optional | Connection string for Render Redis (Celery broker). If omitted, falls back to background threads. |
| `CORS_ORIGINS` | Yes | Comma-separated list of allowed frontend origins (e.g. `https://repohub.onrender.com`). |
| `ENVIRONMENT` | Yes | Set to `production`. |

---

## 4. Render Blueprint (`render.yaml`)

The blueprint configuration remains minimal and maintainable:

```yaml
services:
  - type: web
    name: repohub-backend
    env: python
    region: oregon
    plan: standard
    buildCommand: pip install -r backend/requirements.txt
    startCommand: ./backend/start-render.sh
    healthCheckPath: /api/v1/health
    envVars:
      - key: PYTHON_VERSION
        value: 3.12.16
      - key: ENVIRONMENT
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: repohub-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          type: redis
          name: repohub-redis
          property: connectionString

databases:
  - name: repohub-postgres
    plan: standard
```

---

## 5. Verification After Deployment

Once deployed to Render:
1. Verify database schema: Check Render deploy logs to confirm `Running database migrations... alembic upgrade head` succeeded.
2. Verify API health check: Query `GET https://<render-url>/api/v1/health` to confirm `{"status": "healthy"}`.
3. Test GitHub Webhook: Send a test ping event from GitHub Webhook settings to `https://<render-url>/api/v1/webhooks/github` and verify response is HTTP 200 `pong`.
4. Run AI Query: Navigate to the Intelligence tab on RepoHub Web and verify grounded answers and citation generation.
