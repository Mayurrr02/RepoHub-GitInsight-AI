# RepoHub Architecture Documentation

RepoHub is a full-stack, multi-tenant engineering intelligence and developer analytics SaaS platform. It ingests repository activity from the GitHub REST/GraphQL APIs, processes commit and pull request data asynchronously using background Celery workers, computes advanced productivity and repository health metrics, and visualizes insights via a high-performance React SPA.

---

## High-Level System Architecture

```mermaid
flowchart TB
    subgraph Client ["Client Layer"]
        SPA["React 18 + Vite SPA"]
        WS["WebSocket Client"]
    end

    subgraph Edge ["Edge & Reverse Proxy"]
        NGINX["Nginx 1.27\n- Reverse Proxy & SSL Termination\n- WebSocket Upgrade\n- Rate Limiting Zones\n- Security Headers & Gzip"]
    end

    subgraph API ["Application Server (FastAPI)"]
        Router["API Router (/api/v1)"]
        AuthModule["OAuth & JWT Security"]
        RBAC["RBAC Engine\n(Owner, Admin, Member, Viewer)"]
        RateLimiter["Token Bucket Rate Limiter"]
        Logging["Structured JSON Logger"]
        WSManager["WebSocket Connection Manager"]
        MetricsExport["Prometheus Metrics (/metrics)"]
        HealthEndpoint["Health Check Engine (/health)"]
    end

    subgraph Processing ["Distributed Task Processing (Celery)"]
        TaskWorker["Celery Worker\n- GitHub Ingestion\n- Metric Computations\n- Real-time Progress Broadcast"]
    end

    subgraph Storage ["Persistent & State Layer"]
        Postgres[("PostgreSQL 16\n- Users & Organizations\n- Repositories & Commits\n- PRs, Reviews & Metrics\n- Audit Logs & Notifications")]
        Redis[("Redis 7\n- Celery Broker & Backend\n- Real-time Event Pub/Sub\n- Rate Limiting Cache")]
    end

    subgraph Monitoring ["Observability & Monitoring"]
        Prometheus["Prometheus Server"]
        Grafana["Grafana Dashboards"]
    end

    SPA -->|HTTPS / REST| NGINX
    WS -->|WSS / WebSocket| NGINX
    NGINX -->|HTTP Proxy| Router
    NGINX -->|Upgrade WebSocket| WSManager

    Router --> AuthModule
    Router --> RBAC
    Router --> RateLimiter
    Router --> Logging
    Router --> Postgres
    Router -->|Enqueue Task| Redis

    Redis -->|Tasks| TaskWorker
    TaskWorker -->|Fetch Data| GitHubAPI["GitHub REST API"]
    TaskWorker -->|Persist Records| Postgres
    TaskWorker -->|Publish Realtime Event| Redis
    Redis -->|Pub/Sub Event| WSManager
    WSManager -->|Live Push| WS

    Prometheus -->|Scrape /metrics| MetricsExport
    Grafana -->|Query Metrics| Prometheus
```

---

## Core Subsystems

### 1. Multi-Tenant Organization & RBAC Architecture
Organizations provide multi-tenant isolation for teams.
- **Roles**:
  - `owner`: Full administrative privileges, billing, organization deletion, member management.
  - `admin`: Member invitation, role updates, repository linking/unlinking, audit log inspection.
  - `member`: Link personal repositories to organization, view team dashboards, view contributor rankings.
  - `viewer`: Read-only access to team productivity and metrics.
- **Resource Ownership**:
  - Repositories can be associated with organizations via the `organization_repositories` junction table while retaining user ownership.

### 2. Real-Time WebSocket Pub/Sub Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as Developer Client
    participant API as FastAPI Backend
    participant Redis as Redis Pub/Sub
    participant Worker as Celery Worker
    participant GitHub as GitHub API

    User->>API: POST /api/v1/repositories/sync
    API->>Postgres: Create SyncJob (status="queued")
    API->>Redis: Enqueue sync task
    API-->>User: 202 Accepted {job_id, status: "queued"}

    User->>API: Connect WebSocket /api/v1/ws?token=JWT
    API->>User: {"event": "connected"}

    Worker->>Redis: Fetch next task
    Worker->>Redis: PUBLISH repohub:events {"event":"sync_progress", "progress":10}
    Redis->>API: Pub/Sub message dispatched
    API->>User: WS Push: {"event":"sync_progress", "progress":10}

    Worker->>GitHub: Ingest Commits, PRs, Reviews, Languages
    Worker->>Redis: PUBLISH repohub:events {"event":"sync_progress", "progress":60}
    API->>User: WS Push: {"event":"sync_progress", "progress":60}

    Worker->>Postgres: Calculate Developer & Repo Metrics
    Worker->>Redis: PUBLISH repohub:events {"event":"sync_completed", "progress":100}
    API->>User: WS Push: {"event":"sync_completed", "count":12}
```

### 3. Observability Architecture
- **Metrics**: Standard Prometheus exposition format via `/metrics`.
  - HTTP request volume, status codes, latency histograms.
  - Celery task throughput and execution times.
  - Active WebSocket client count.
  - Security audit event counters.
- **Logging**: Structured JSON single-line logs format matching cloud log collector specifications (Loki, Datadog, ELK).
- **Health Probes**: Multi-tier health endpoints:
  - `/health`: Deep component diagnostic (DB ping, Redis ping, Celery node status).
  - `/health/ready`: Readiness probe for load balancers.
  - `/health/live`: Liveness probe for orchestrators (Kubernetes/Docker).
