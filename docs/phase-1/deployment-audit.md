# Deployment & Infrastructure Audit

## 1. Hosting Architecture Overview

RepoHub's production hosting configuration is defined in `render.yaml` for deployment on **Render**:

```yaml
services:
  - type: web
    runtime: python
    name: repohub-api
    plan: free
    region: singapore
    rootDir: backend
    buildCommand: pip install --no-cache-dir -r requirements.txt
    startCommand: sh start-render.sh
    healthCheckPath: /health
    autoDeployTrigger: commit
    envVars:
      - key: PYTHON_VERSION
        value: 3.12.8
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        sync: false
      - key: FRONTEND_URL
        sync: false
      - key: GITHUB_CLIENT_ID
        sync: false
      - key: GITHUB_CLIENT_SECRET
        sync: false
      - key: GITHUB_REDIRECT_URI
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        value: gemini-3.5-flash
      - key: JWT_SECRET_KEY
        generateValue: true
      - key: JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        value: "15"
      - key: JWT_REFRESH_TOKEN_EXPIRE_DAYS
        value: "30"

  - type: web
    runtime: static
    name: repohub-web
    rootDir: frontend
    buildCommand: npm install && npm run build
    staticPublishPath: dist
    autoDeployTrigger: commit
    envVars:
      - key: VITE_API_URL
        sync: false
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

---

## 2. Process & Execution Model

### `backend/start-render.sh`
```sh
#!/bin/sh
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
```

**Key Operational Findings**:
- To run on Render's free plan, both the Celery worker and the Uvicorn web server run concurrently inside the same container.
- `alembic upgrade head` executes automatically on service start before launching worker or API.
- Trap cleanup terminates the Celery worker process on container shutdown.

### Fallback Processing
In `app/api/routes/repositories.py`:
When `sync_repositories.delay(job.id)` fails due to missing Celery/Redis connection, a background daemon thread is launched:
```python
thread = threading.Thread(target=sync_repositories, args=(job.id,), daemon=True)
thread.start()
```
This ensures zero crashes even if Redis is unreachable.

---

## 3. Environment Variables Reference

| Variable | Purpose | Default / Example | Required in Prod |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `sqlite:///./repo_hub.db` | Yes |
| `REDIS_URL` | Celery broker & WS Pub/Sub | `redis://localhost:6379/0` | Optional (falls back to threads) |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth App ID | None | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Secret | None | Yes |
| `GITHUB_REDIRECT_URI` | GitHub OAuth Callback | `http://localhost:8000/api/v1/auth/github/callback` | Yes |
| `GITHUB_WEBHOOK_SECRET`| HMAC SHA-256 Webhook Verification | None | Recommended for webhooks |
| `GEMINI_API_KEY` | Google GenAI API Key | None | Yes for AI features |
| `GEMINI_MODEL` | Gemini Model Identifier | `gemini-3.5-flash` | No (has default) |
| `JWT_SECRET_KEY` | Secret for signing auth tokens | `"development-only-change-me"` | Yes |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Access token lifespan | `15` | No |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token lifespan | `30` | No |
| `VITE_API_URL` | Frontend API Target | None (uses relative or configured proxy) | Yes for frontend |

---

## 4. Health Checks & Monitoring

- **Endpoint**: `GET /health` (`app/api/routes/health.py`)
  Checks:
  - Database connectivity via `SELECT 1`.
  - Redis ping status.
  - Celery ping check (with 1.5s timeout).
  - System memory and process uptime.
- **Observability**: `GET /metrics` (`app/api/routes/metrics.py`)
  Exports Prometheus counters and histograms:
  - `http_requests_total`
  - `http_request_duration_seconds`
  - `sync_jobs_total`
  - `celery_task_duration_seconds`
  - `active_websocket_connections`

---

## 5. Render Deployment Compatibility Constraints

1. **Keep `render.yaml` Intact**: Do not switch to AWS, Railway, EC2, or Kubernetes.
2. **Preserve Single-Container Co-Hosting**: Allow Uvicorn and Celery to co-exist in `start-render.sh`.
3. **Database URL Normalization**: The `config.py` validator automatically normalizes `postgres://` or `postgresql://` into `postgresql+psycopg://`. This must be preserved for compatibility with Render's PostgreSQL connection URLs.
4. **No Destructive Database Changes**: Any schema extensions must run seamlessly through `alembic upgrade head` without breaking existing tables or dropping production data.
