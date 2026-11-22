# Database Audit & Schema Assessment

## 1. Database Architecture Overview

- **Database Engine**: PostgreSQL 16 (production on Render/cloud) / SQLite 3 (local development and test fixtures).
- **ORM**: SQLAlchemy 2.0.36 with typed declarative mappings (`Mapped[...]`, `mapped_column(...)`).
- **Migration Framework**: Alembic 1.14.0 with 5 applied versions (`001_initial` through `005_api_keys`).
- **Connection Handling**: `app/db/session.py` with connection pooling, `pool_pre_ping=True`, and `check_same_thread=False` for SQLite.

---

## 2. Existing Schema (20 Tables)

### User & Identity
1. `users`
   - Columns: `id` (PK), `github_id` (Unique, Int), `login` (Unique, VarChar 255), `name` (VarChar 255), `avatar_url` (VarChar 2048), `created_at` (DateTime TZ).
   - Relationships: `github_account`, `repositories`, `organization_memberships`, `owned_organizations`, `api_keys`.
2. `github_accounts`
   - Columns: `id` (PK), `user_id` (FK -> users.id, Unique, CASCADE), `access_token` (Text), `scope` (VarChar 255).
3. `api_keys`
   - Columns: `id` (PK), `user_id` (FK -> users.id, CASCADE), `name` (VarChar 255), `key_hash` (Unique, VarChar 128), `prefix` (VarChar 32), `created_at`, `expires_at`, `last_used_at`.

### Organizations & Access Control (RBAC)
4. `organizations`
   - Columns: `id` (PK), `name` (VarChar 255), `slug` (Unique, VarChar 255), `avatar_url` (VarChar 2048), `owner_id` (FK -> users.id, CASCADE), `created_at`.
5. `organization_members`
   - Columns: `id` (PK), `organization_id` (FK, CASCADE), `user_id` (FK, CASCADE), `role` (VarChar 32, default 'member'), `joined_at`.
   - Constraints: `UniqueConstraint("organization_id", "user_id", name="uq_org_member")`.
6. `organization_repositories`
   - Columns: `id` (PK), `organization_id` (FK, CASCADE), `repository_id` (FK, CASCADE), `added_at`.
   - Constraints: `UniqueConstraint("organization_id", "repository_id", name="uq_org_repo")`.

### Repositories & Git Ingestion
7. `repositories`
   - Columns: `id` (PK), `user_id` (FK -> users.id, CASCADE), `github_id` (Int), `name` (VarChar 255), `full_name` (VarChar 512), `html_url` (VarChar 2048), `description` (Text), `is_private` (Boolean), `language` (VarChar 64), `stars` (Int), `updated_at` (DateTime TZ).
   - Constraints: `UniqueConstraint("user_id", "github_id", name="uq_repository_user_github")`.
8. `commits`
   - Columns: `id` (PK), `repository_id` (FK -> repositories.id, CASCADE), `sha` (VarChar 64), `author_login` (VarChar 255), `message` (Text), `committed_at` (DateTime TZ).
   - Constraints: `UniqueConstraint("repository_id", "sha", name="uq_commit_repository_sha")`.
9. `pull_requests`
   - Columns: `id` (PK), `repository_id` (FK -> repositories.id, CASCADE), `github_id` (Int), `number` (Int), `author_login` (VarChar 255), `state` (VarChar 32), `created_at`, `merged_at`, `closed_at`.
   - Constraints: `UniqueConstraint("repository_id", "github_id", name="uq_pr_repository_github")`.
10. `issues`
    - Columns: `id` (PK), `repository_id` (FK -> repositories.id, CASCADE), `github_id` (Int), `state` (VarChar 32), `created_at`, `closed_at`.
    - Constraints: `UniqueConstraint("repository_id", "github_id", name="uq_issue_repository_github")`.
11. `reviews`
    - Columns: `id` (PK), `pull_request_id` (FK -> pull_requests.id, CASCADE), `github_id` (Int), `reviewer_login` (VarChar 255), `state` (VarChar 32), `submitted_at`.
    - Constraints: `UniqueConstraint("pull_request_id", "github_id", name="uq_review_pr_github")`.
12. `releases`
    - Columns: `id` (PK), `repository_id` (FK -> repositories.id, CASCADE), `github_id` (Int), `name` (VarChar 255), `published_at`.
    - Constraints: `UniqueConstraint("repository_id", "github_id", name="uq_release_repository_github")`.
13. `contributors`
    - Columns: `id` (PK), `repository_id` (FK -> repositories.id, CASCADE), `github_id` (Int), `login` (VarChar 255), `contributions` (Int).
    - Constraints: `UniqueConstraint("repository_id", "github_id", name="uq_contributor_repository_github")`.
14. `languages`
    - Columns: `id` (PK), `repository_id` (FK -> repositories.id, CASCADE), `name` (VarChar 128), `bytes` (Int).
    - Constraints: `UniqueConstraint("repository_id", "name", name="uq_language_repository_name")`.

### Analytics, Operations & Logging
15. `developer_metrics`
    - Columns: `id` (PK), `user_id` (FK, Unique, CASCADE), `commit_frequency`, `coding_streak`, `average_commits_per_day`, `coding_hours`, `weekend_activity`, `review_score`, `calculated_at`.
16. `repository_metrics`
    - Columns: `id` (PK), `repository_id` (FK, Unique, CASCADE), `merge_rate`, `issue_resolution_rate`, `health_score`, `activity_score`, `documentation_score`, `maintenance_score`, `calculated_at`.
17. `ai_reports`
    - Columns: `id` (PK), `user_id` (FK, CASCADE), `status` (VarChar 32), `content` (Text), `file_path` (VarChar 1024), `created_at`, `completed_at`.
18. `notifications`
    - Columns: `id` (PK), `user_id` (FK, CASCADE), `type` (VarChar 64), `message` (Text), `read` (Boolean), `created_at`.
19. `sync_jobs`
    - Columns: `id` (PK), `user_id` (FK, CASCADE), `status` (VarChar 32), `error` (Text), `started_at`, `completed_at`.
20. `audit_logs`
    - Columns: `id` (PK), `user_id` (FK, SET NULL), `organization_id` (FK, CASCADE), `action` (VarChar 128), `resource_type` (VarChar 64), `resource_id` (VarChar 128), `details` (Text), `ip_address` (VarChar 64), `created_at`.

---

## 3. Migration History Analysis

- `001_initial.py`: Created `users`, `github_accounts`, `repositories`, `sync_jobs`.
- `002_analytics.py`: Created `commits`, `pull_requests`, `issues`, `reviews`, `releases`, `contributors`, `languages`, `developer_metrics`, `repository_metrics`.
- `003_ai_intelligence.py`: Created `ai_reports`, `notifications`.
- `004_enterprise_production.py`: Created `organizations`, `organization_members`, `organization_repositories`, `audit_logs`.
- `005_api_keys.py`: Created `api_keys`.

All migrations have proper `upgrade()` and `downgrade()` methods and apply clean indexes on foreign keys.

---

## 4. Tenant Isolation & Permissions Audit

- **User Scope**: Each repository is linked to a `User` via `user_id`. Queries in `app/api/routes/repositories.py` strictly filter with `Repository.user_id == user.id`.
- **Organization Scope**: Repositories are linked via `organization_repositories`. Membership and RBAC checks verify `OrganizationMember.user_id == user.id` and check roles (`owner`, `admin`, `member`, `viewer`).
- **Data Leakage Check**: Current endpoints prevent cross-tenant repository inspection. However, AI chat is currently user-level rather than repository-level and lacks repository tenant validation.

---

## 5. Schema Deficiencies & Required Phase 1 Extensions

To support the Repository Intelligence Engine and AI Repository Assistant, the schema must be extended:

1. **Branch Tracking**:
   - Table `branches`: `id`, `repository_id` (FK), `name`, `commit_sha`, `is_default`, `is_protected`, `updated_at`.
2. **Detailed Commit Data**:
   - Add columns to `commits`: `parent_shas` (JSON/Text), `author_name`, `author_email`, `committer_name`, `committer_email`, `additions` (Int), `deletions` (Int), `total_changes` (Int), `files_changed_count` (Int).
   - Table `commit_file_changes`: `id`, `commit_id` (FK), `file_path`, `status` (added/modified/removed/renamed), `additions`, `deletions`, `patch` (Text), `previous_path`.
3. **Comprehensive Pull Requests & Issues**:
   - Add columns to `pull_requests`: `title`, `body` (Text), `base_branch`, `head_branch`, `base_sha`, `head_sha`, `additions`, `deletions`, `changed_files`, `labels` (JSON).
   - Table `pull_request_files`: `id`, `pull_request_id` (FK), `file_path`, `status`, `additions`, `deletions`, `patch`.
   - Table `review_comments`: `id`, `review_id` (FK), `pull_request_id` (FK), `github_id`, `path`, `line`, `commit_id`, `body`, `author_login`, `created_at`.
   - Add columns to `issues`: `number` (Int), `title`, `body` (Text), `author_login`, `labels` (JSON), `comments_count`.
   - Table `issue_comments`: `id`, `issue_id` (FK), `github_id`, `author_login`, `body`, `created_at`.
4. **Code Indexing & Semantic Engine**:
   - Table `code_chunks`: `id`, `repository_id` (FK), `commit_sha` (VarChar 64), `file_path` (VarChar 1024), `start_line` (Int), `end_line` (Int), `language` (VarChar 64), `chunk_type` (function/class/module/fallback), `content_hash` (VarChar 64), `content` (Text), `embedding` (JSON or Vector if pgvector enabled), `created_at`.
   - Table `code_symbols`: `id`, `repository_id` (FK), `commit_sha` (VarChar 64), `file_path` (VarChar 1024), `symbol_name` (VarChar 255), `symbol_type` (function/class/method/interface), `start_line` (Int), `end_line` (Int), `signature` (Text).
   - Table `repository_sync_cursors`: `id`, `repository_id` (FK, Unique), `indexed_commit_sha`, `last_sync_at`, `status`, `error`.
5. **Webhook Deliveries**:
   - Table `webhook_deliveries`: `id` (PK), `delivery_id` (Unique VarChar 128), `event` (VarChar 64), `repository_id` (FK nullable), `payload_hash` (VarChar 64), `status` (received/processed/failed), `received_at`.
6. **AI Conversation Persistence & Grounding**:
   - Table `ai_conversations`: `id` (PK, UUID or Int), `user_id` (FK), `repository_id` (FK nullable), `title` (VarChar 255), `created_at`, `updated_at`.
   - Table `ai_messages`: `id` (PK), `conversation_id` (FK), `role` (user/assistant/system), `content` (Text), `tool_calls` (JSON nullable), `grounded_references` (JSON nullable), `created_at`.
   - Table `ai_tool_logs`: `id` (PK), `conversation_id` (FK), `tool_name` (VarChar 128), `arguments` (JSON), `result` (JSON), `duration_ms` (Float), `created_at`.
