# RepoHub API Reference

All REST endpoints are rooted at `/api/v1` except root health and observability probes (`/health`, `/metrics`).

---

## Authentication & Authorization

All protected endpoints require an `Authorization: Bearer <access_token>` header.

| Status Code | Description |
|---|---|
| `200 OK` | Successful request |
| `201 Created` | Resource created |
| `202 Accepted` | Background task queued |
| `204 No Content` | Action completed without body |
| `401 Unauthorized` | Invalid or expired JWT token |
| `403 Forbidden` | Insufficient role permissions |
| `404 Not Found` | Requested entity does not exist |
| `409 Conflict` | Unique constraint violation |
| `422 Unprocessable` | Validation error |
| `429 Too Many Requests` | Rate limit exceeded |

---

## Endpoints

### 1. Authentication

- `POST /api/v1/auth/github/login`: Returns GitHub OAuth authorization URL.
- `GET /api/v1/auth/github/callback`: OAuth callback redirecting to frontend with JWT token pair.
- `POST /api/v1/auth/refresh`: Exchanges refresh token for new access token.
- `POST /api/v1/auth/logout`: Discards authentication session.

### 2. User & Repositories

- `GET /api/v1/users/me`: Authenticated user profile.
- `GET /api/v1/repositories`: List user's synced GitHub repositories.
- `POST /api/v1/repositories/sync`: Queue asynchronous repository synchronization via Celery.

### 3. Developer & Repository Analytics

- `GET /api/v1/analytics/developer`: Coding streak, average commits/day, estimated hours, weekend activity, and review score.
- `GET /api/v1/analytics/repository`: Per-repository health score, activity score, merge efficiency, and maintenance score.
- `GET /api/v1/analytics/history?days=90`: Commit history timeline and language distribution.

### 4. Multi-Tenant Organizations & RBAC

- `POST /api/v1/organizations`: Create new organization.
  ```json
  { "name": "Acme Engineering", "slug": "acme-engineering" }
  ```
- `GET /api/v1/organizations`: List organizations current user belongs to.
- `GET /api/v1/organizations/{id}`: Organization details, member count, repository count.
- `PUT /api/v1/organizations/{id}`: Update organization name or avatar (Admin/Owner).
- `DELETE /api/v1/organizations/{id}`: Delete organization (Owner only).
- `GET /api/v1/organizations/{id}/members`: List organization members and roles.
- `POST /api/v1/organizations/{id}/members`: Add/invite member by GitHub username (Admin/Owner).
- `PUT /api/v1/organizations/{id}/members/{user_id}`: Update member role (`owner`, `admin`, `member`, `viewer`).
- `DELETE /api/v1/organizations/{id}/members/{user_id}`: Remove member from organization.
- `GET /api/v1/organizations/{id}/repositories`: List organization repositories.
- `POST /api/v1/organizations/{id}/repositories/{repo_id}`: Link repository to organization.
- `DELETE /api/v1/organizations/{id}/repositories/{repo_id}`: Unlink repository.

### 5. Team Analytics & Contributor Rankings

- `GET /api/v1/organizations/{id}/analytics/overview`: High-level aggregated team health, activity, and merge rates.
- `GET /api/v1/organizations/{id}/analytics/rankings`: Contributor rankings leaderboard weighted by commits, PRs, and reviews.
- `GET /api/v1/organizations/{id}/analytics/productivity?weeks=12`: Weekly velocity scores, commit timeline, merged PR counts.
- `GET /api/v1/organizations/{id}/analytics/bottlenecks`: Time to first review, time to merge, and list of unreviewed PRs.

### 6. Security Audit Logs

- `GET /api/v1/organizations/{id}/audit-logs?limit=50&offset=0&action=member.add`: Paginated audit logs with action filters.

### 7. Real-Time WebSockets

- `WebSocket /api/v1/ws?token=<access_token>`
  - Event `connected`: Initial greeting upon connection.
  - Event `sync_progress`: Live progress updates (`progress`: 0-100, `step`: text description).
  - Event `sync_completed`: Sync completion alert with repository count.
  - Heartbeat: Send `"ping"` from client, server replies `"pong"`.

### 8. Observability & Health

- `GET /health`: Comprehensive multi-component health report (database, redis, celery).
- `GET /health/live`: Fast liveness probe.
- `GET /health/ready`: Database readiness probe.
- `GET /metrics`: Prometheus metric exposition.
