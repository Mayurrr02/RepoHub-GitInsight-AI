# Existing Architecture Audit

## 1. Executive Summary

RepoHub is a full-stack, multi-tenant engineering intelligence and developer analytics SaaS application. The system integrates with GitHub's REST API using OAuth, ingests repository metadata, commits, pull requests, issues, reviews, releases, and contributors, computes developer and repository health metrics, and displays analytics and AI-generated insights via a React single-page application.

The platform is designed around a modular monolithic backend architecture with asynchronous worker task execution and real-time WebSocket communication.

---

## 2. Technology Stack

### Frontend
- **Framework & Tooling**: React 18.3.1, TypeScript 5.7.2, Vite 6.0.3.
- **Styling & Design System**: TailwindCSS 3.4.16 with dark-mode class strategy, custom color palettes (`#080B12`, `#0D111A`, `brand-purple: #7C3AED`), SVG icons in `frontend/src/components/icons/Icons.tsx`.
- **Routing**: `react-router-dom` v7.1.1 with `BrowserRouter`, layout wrapper (`Layout.tsx`), and authentication guards (`ProtectedRoute.tsx`).
- **State Management**:
  - Global client state: Zustand 5.0.2 (`src/store/auth.ts`, `src/store/theme.ts`).
  - Server state & caching: TanStack React Query 5.62.7.
- **HTTP Client**: Axios 1.7.9 configured in `src/api/client.ts` with request/response interceptors for Bearer token injection and transparent 401 token refresh.
- **Real-time Client**: Native WebSocket hook (`src/lib/useWebSocket.ts`) connecting to `/api/v1/ws`.

### Backend
- **Framework**: FastAPI 0.115.6 on Python 3.12 (Uvicorn 0.34.0 server).
- **ORM & Database Toolkit**: SQLAlchemy 2.0.36 with `Mapped` typed models and Alembic 1.14.0 for schema migrations.
- **Database Driver**: `psycopg` 3.2.3 with `psycopg-binary` for PostgreSQL; supports SQLite (`sqlite:///`) for local development and test fixtures.
- **Asynchronous Task Queue**: Celery 5.4.0 with Redis 5.2.1 broker and backend; includes thread-based fallback when Celery or Redis is unavailable.
- **Authentication & Security**: PyJWT 2.10.1 (HS256 access and refresh tokens), cryptography 50.0.2, token bucket rate limiter in `app/core/rate_limit.py`.
- **AI & Document Generation**: Google GenAI SDK (`google-genai` 3.6.1) targeting Gemini (`gemini-3.5-flash`), ReportLab 4.2.5 for PDF generation.
- **Observability**: Prometheus client 0.26.0 (`/metrics`), structured JSON logger (`app/core/logging.py`), correlation ID tracking (`app/core/middleware.py`), and health diagnostics (`/health`).

---

## 3. Component & Service Layout

```
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py               # Dependency injection (current_user, RBAC, DB session)
│   │   │   ├── router.py             # Root v1 router aggregator
│   │   │   └── routes/
│   │   │       ├── ai.py             # AI chat and PDF report endpoints
│   │   │       ├── analytics.py      # Developer and repository analytics
│   │   │       ├── audit_logs.py     # Organization audit logs
│   │   │       ├── auth.py           # GitHub OAuth, JWT refresh, logout
│   │   │       ├── health.py         # Liveness and readiness probes
│   │   │       ├── metrics.py        # Prometheus metrics endpoint
│   │   │       ├── organizations.py  # Multi-tenant orgs and RBAC
│   │   │       ├── repositories.py   # Repository listing, inspection, manual sync
│   │   │       ├── team_analytics.py # Organization-level aggregation metrics
│   │   │       ├── users.py          # User profile and API keys
│   │   │       └── ws.py             # WebSocket connection endpoint
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic Settings (DATABASE_URL, GEMINI_API_KEY, etc.)
│   │   │   ├── logging.py            # Structured JSON logging
│   │   │   ├── metrics.py            # Prometheus counter & histogram definitions
│   │   │   ├── middleware.py         # Observability, SecurityHeaders, CorrelationID
│   │   │   ├── rate_limit.py         # In-memory token bucket rate limiter
│   │   │   ├── rbac.py               # Organization role enforcement
│   │   │   ├── security.py           # Password hashing & JWT generation/verification
│   │   │   └── ws_manager.py         # WebSocket connection pool & Redis pub/sub dispatcher
│   │   ├── db/
│   │   │   ├── base.py               # DeclarativeBase definition
│   │   │   └── session.py            # Engine and SessionLocal factory
│   │   ├── models/
│   │   │   └── models.py             # SQLAlchemy ORM model definitions (20 tables)
│   │   ├── schemas/
│   │   │   └── schemas.py            # Pydantic DTO schemas
│   │   ├── services/
│   │   │   ├── ai.py                 # Gemini invocation & ReportLab PDF generator
│   │   │   ├── analytics.py          # Math calculations for scores and streaks
│   │   │   ├── audit.py              # Audit log helper
│   │   │   ├── github.py             # GitHub OAuth & REST data ingestion
│   │   │   ├── organization.py       # Organization business logic
│   │   │   └── team_analytics.py     # Team-level aggregation logic
│   │   └── workers/
│   │       ├── celery_app.py         # Celery instance configuration
│   │       └── tasks.py              # sync_repositories background task
│   └── tests/                        # 23 pytest tests across 11 modules
└── frontend/
    └── src/
        ├── api/                      # Axios API client functions
        ├── components/               # Layout, ProtectedRoute, UI cards, charts, icons
        ├── pages/                    # 12 React router view pages
        └── store/                    # Zustand stores for auth and theme
```

---

## 4. Key Request Flows

### Authentication Flow
1. User clicks "Connect GitHub" in `frontend/src/pages/LoginPage.tsx`.
2. Frontend calls `POST /api/v1/auth/github/login` -> backend responds with GitHub OAuth URL containing `client_id` and `scope=repo,read:user,user:email`.
3. User authorizes on GitHub; GitHub redirects browser to `http://localhost:5173/auth/callback?code=<code>`.
4. `frontend/src/pages/AuthCallbackPage.tsx` passes `code` to `GET /api/v1/auth/github/callback?code=<code>`.
5. Backend exchanges `code` for GitHub `access_token` via `https://github.com/login/oauth/access_token`.
6. Backend fetches user identity from GitHub `/user`, creates or updates `User` and `GitHubAccount` records.
7. Backend signs JWT access token (15m expiry) and refresh token (30d expiry), returns tokens to client.
8. Frontend stores tokens in `localStorage` and initializes Zustand `useAuthStore`.

### Repository Ingestion Flow (Existing)
1. User clicks "Sync Repositories" on `/repositories`.
2. Frontend sends `POST /api/v1/repositories/sync`.
3. Backend creates `SyncJob(user_id=user.id, status="queued")` and dispatches Celery task `sync_repositories.delay(job.id)` (with fallback to daemon thread if Celery/Redis fails).
4. Worker updates `SyncJob.status = "running"` and publishes WebSocket event `sync_progress`.
5. Worker invokes GitHub REST API to fetch user repositories (`/user/repos?per_page=100`).
6. Worker loops through repositories and calls `fetch_repository_data(access_token, full_name)` to retrieve commits, PRs, issues, releases, contributors, languages, branches, and reviews (first 100 items each).
7. Worker upserts records into PostgreSQL, computes metrics, and sets `SyncJob.status = "completed"`.
8. Worker emits `sync_completed` event through WebSocket manager.

---

## 5. Architectural Strengths & Critical Gaps

### Strengths
- Clean separation of concerns between API routing, models, schemas, and workers.
- Graceful degradation: background worker falls back to daemon threads if Redis is absent.
- Robust security foundations: RBAC, correlation ID tracing, audit logs, and security headers.
- Active Prometheus metrics and detailed health endpoints.

### Gaps Requiring Resolution in Phase 1
- **Shallow Ingestion**: GitHub ingestion only queries page 1 (first 100 items). No diffs, no commit file changes, no PR file changes, no issue comments.
- **No Webhook Engine**: System only supports manual pull-based sync; no webhook receiver, HMAC verification, or event deduplication.
- **No Source Code Indexing**: No code file retrieval, no chunking, no AST parsing, no semantic embeddings.
- **Primitive AI Layer**: Current AI service simply formats developer metrics into a prompt string for Gemini; no repository context, no tool calling, no grounded evidence citations, no conversation persistence.
