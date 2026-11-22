# Existing Features Audit

## 1. Feature Inventory Matrix

| Feature Area | Module / Location | Status | Current Capabilities | Limitations / Notes |
|---|---|---|---|---|
| **GitHub OAuth Authentication** | `app/api/routes/auth.py`, `src/pages/LoginPage.tsx` | Production Ready | - OAuth URL generation<br>- Code exchange<br>- Token persistence<br>- Refresh token rotation<br>- Session logout | Tokens stored in plaintext in `github_accounts` table. |
| **User Profile & API Keys** | `app/api/routes/users.py`, `src/pages/ProfilePage.tsx` | Production Ready | - User profile retrieval<br>- API key generation with secure prefix hashing<br>- List & revoke API keys | API keys support basic authorization but not granular repo-scoped tokens. |
| **Repository Management** | `app/api/routes/repositories.py`, `src/pages/RepositoriesPage.tsx` | Production Ready | - List user repos<br>- Detailed repository modal inspection<br>- Clone URL copying<br>- Recent commit listing | Only inspects first 10 commits; no branch switcher or file browser. |
| **Repository Ingestion** | `app/services/github.py`, `app/workers/tasks.py` | Functional MVP | - Manual sync trigger<br>- Ingests up to 100 commits, PRs, issues, contributors, releases, languages | - Single-page REST fetch (max 100 items)<br>- Discards branches<br>- No commit file diffs<br>- No PR files<br>- No issue/review comments |
| **Developer Metrics** | `app/services/analytics.py`, `src/pages/OverviewPage.tsx` | Production Ready | - Coding streak (consecutive days)<br>- Average commits/day<br>- Coding hours estimate<br>- Weekend activity percentage<br>- Review score | Hardcoded heuristics based on 100 latest commits. |
| **Repository Health Metrics** | `app/services/analytics.py`, `src/components/ui/HealthScoreBadge.tsx` | Production Ready | - Merge rate calculation<br>- Issue resolution rate<br>- Health score (weighted index)<br>- Activity, maintenance, and doc scores | Scored only over the 100 synced records. |
| **Multi-Tenant Organizations** | `app/api/routes/organizations.py`, `src/pages/OrganizationsPage.tsx` | Production Ready | - Create organizations<br>- Invite members by GitHub login<br>- RBAC roles: owner, admin, member, viewer<br>- Link repos to orgs | Independent from user repositories. |
| **Team Analytics** | `app/api/routes/team_analytics.py`, `src/pages/TeamDashboardPage.tsx` | Production Ready | - Aggregated team velocity<br>- Code review turnaround time<br>- Member contribution leaderboard | Computed across organization repositories. |
| **Audit Logs** | `app/api/routes/audit_logs.py`, `app/services/audit.py` | Production Ready | - Record actions (org create, member invite, role change)<br>- Filter by organization and action type | Captures IP address and user actor. |
| **Real-time WebSockets** | `app/core/ws_manager.py`, `app/api/routes/ws.py`, `src/lib/useWebSocket.ts` | Production Ready | - Redis Pub/Sub broadcast<br>- In-memory connection fallback<br>- Real-time sync progress toast | Realtime events: `sync_progress`, `sync_completed`, `sync_failed`. |
| **AI Assistant (Legacy)** | `app/api/routes/ai.py`, `src/pages/IntelligencePage.tsx` | Minimal MVP | - Single chat endpoint `POST /api/v1/ai/chat`<br>- Calls Gemini `gemini-3.5-flash`<br>- Injects developer metrics context | - No repo selection<br>- No file/code understanding<br>- No tool calling<br>- No persistence |
| **Engineering PDF Reports** | `app/api/routes/ai.py`, `src/pages/ReportsPage.tsx` | Production Ready | - Generates PDF using ReportLab<br>- Embeds developer metrics table & AI career recommendations<br>- Download as attachment | Report is user-centric, not repository-centric. |

---

## 2. Deep Dive: Analytics Engine

Located in `backend/app/services/analytics.py`:
- `calculate_developer_metrics(db, user_id)`:
  - Fetches commits from all user repositories.
  - Groups commits by calendar date (`datetime.date`).
  - Computes `coding_streak` by walking backwards from today.
  - Computes `average_commits_per_day` across active days.
  - Estimates `coding_hours` based on 0.5 hours per commit plus day overhead.
  - Estimates `weekend_activity` as the ratio of weekend commits to total commits.
  - Computes `review_score` based on review count and PR merge velocity.
- `calculate_repository_metrics(db, repository)`:
  - `merge_rate = merged_prs / total_prs`.
  - `issue_resolution_rate = closed_issues / total_issues`.
  - `activity_score = min(100.0, (commits * 0.4) + (prs * 0.3) + (contributors * 3.0))`.
  - `health_score = (merge_rate * 30) + (issue_resolution_rate * 30) + (activity_score * 0.4)`.

---

## 3. Deep Dive: AI Service (Current Implementation)

Located in `backend/app/services/ai.py`:
- `analytics_context(db, user)`:
  Constructs a single prose string:
  ```
  Developer: {user.login}. Developer metrics: {developer}. Repositories: {metrics}. Languages: {languages}.
  ```
- `generate_insights(db, user, question)`:
  Invokes Google GenAI with prompt:
  ```
  System: "You are a precise engineering career analyst. Use only provided GitHub analytics."
  User: "{context}\n\nQuestion: {prompt}"
  ```
- Fallback: Returns error message indicating `GEMINI_API_KEY` configuration status if the API call fails or key is missing.

---

## 4. Features to Preserve During Phase 1

1. **Authentication Flow**: Do not break GitHub OAuth callback or JWT token contracts.
2. **Existing Endpoints**: Keep all `/api/v1/repositories`, `/api/v1/analytics`, `/api/v1/organizations`, `/api/v1/users`, `/health`, `/metrics` backward-compatible.
3. **Database Records**: Preserve existing user, repository, organization, and metric rows without dropping or destructive modifications.
4. **Realtime WebSockets**: Preserve event structures (`sync_progress`, `sync_completed`, `sync_failed`) so the existing UI toast continues functioning.
5. **PDF Export**: Maintain the `/api/v1/ai/report` endpoint while expanding report capabilities.
