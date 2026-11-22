# GitHub Ingestion Audit & Gap Analysis

## 1. Existing Ingestion Pipeline

### Architecture
- **Entry Point**: `POST /api/v1/repositories/sync` in `backend/app/api/routes/repositories.py`.
- **Dispatcher**: Enqueues Celery task `sync_repositories.delay(job_id)`. If Celery/Redis connection fails, gracefully spawns a Python daemon thread: `threading.Thread(target=sync_repositories, args=(job.id,), daemon=True)`.
- **Worker Execution**: `app/workers/tasks.py::sync_repositories`:
  1. Updates `SyncJob.status = "running"`.
  2. Emits `sync_progress` event (10%) over WebSocket.
  3. Invokes `asyncio.run(fetch_repositories(token))`.
  4. Calls `persist_repositories(db, user_id, raw_repos)`.
  5. For each repo:
     - Calls `asyncio.run(fetch_repository_data(token, full_name))`.
     - Calls `persist_repository_data(db, repo, data)`.
     - Recomputes `calculate_repository_metrics(db, repo)`.
     - Broadcasts progress percentage.
  6. Recomputes `calculate_developer_metrics(db, user_id)`.
  7. Creates `Notification` and updates `SyncJob.status = "completed"`.

---

## 2. Ingested Data Scope vs Target Requirements

| Entity | Currently Ingested Fields | Missing Fields Required for Intelligence Engine |
|---|---|---|
| **Repository Metadata** | name, full_name, html_url, description, is_private, language, stars, updated_at | default_branch, topics, created_at, open_issues_count, forks_count, license, visibility, archived_status |
| **Branches** | Fetched from `/repos/{full_name}/branches` but discarded! | name, commit_sha, is_default, is_protected, branch cursor |
| **Commits** | sha, author_login, message, committed_at | parent_shas, author_name, author_email, committer_name, committer_email, additions, deletions, total_changes, changed_files_count, commit_url |
| **Commit File Changes** | None (not fetched or stored) | file_path, status (modified/added/removed), additions, deletions, patch diff, previous_path, blob_sha |
| **Pull Requests** | number, author_login, state, created_at, merged_at, closed_at | title, body/description, base_branch, head_branch, base_sha, head_sha, additions, deletions, changed_files, merge_commit_sha, labels |
| **PR Files** | None (not fetched or stored) | file_path, status, additions, deletions, patch diff |
| **Reviews** | reviewer_login, state, submitted_at | review body / comments, commit_id |
| **Review Comments** | None (not fetched or stored) | path, line, commit_id, body, author_login, created_at |
| **Issues** | state, created_at, closed_at | issue number, title, body/description, author_login, labels, assignees, comments_count |
| **Issue Comments** | None (not fetched or stored) | comment body, author_login, created_at |
| **Releases & Tags** | name, published_at | tag_name, target_commitish, body, draft, prerelease |
| **Contributors** | login, contributions count | avatar_url, html_url, email |
| **Languages** | name, bytes | percentage distribution |

---

## 3. GitHub API Ingestion Bottlenecks & Failure Modes

1. **Hard Limit of 100 Items**:
   - `fetch_repository_data` sets `params={"per_page": 100}` on a single request per endpoint.
   - For repositories with more than 100 commits or PRs, history is silently truncated.
   - Need pagination support with sensible limits and cursors for initial vs incremental imports.
2. **Missing Diff / Patch Details**:
   - Diffs are necessary for the AI Assistant to explain what changed between commits or in PRs.
   - Large diffs (>1MB) must be truncated or stored securely with blob references rather than blowing up PostgreSQL row limits.
3. **No Webhook Receiver**:
   - Updates only occur when a user manually clicks "Sync Repositories".
   - No GitHub webhook handler exists for `push`, `pull_request`, `issues`, or `release` events.
   - No HMAC SHA-256 signature verification (`X-Hub-Signature-256`).
   - No delivery idempotency (`X-GitHub-Delivery`).
4. **Rate Limit Handling**:
   - Current implementation catches all exceptions with `try ... except Exception: return default`.
   - When a 429 or secondary rate limit is hit, it swallows the error, treats it as empty data, and marks the job complete with missing data.
   - Must implement exponential backoff, retry handling, and `Retry-After` header inspection.

---

## 4. Ingestion Improvement Strategy for Phase 1

1. **Extend `github.py` with multi-page pagination & diff fetching**:
   - Add commit detail and commit file changes fetching.
   - Add PR detail, PR files, and review comments fetching.
   - Add issue detail and comments fetching.
2. **Implement GitHub Webhook Handler**:
   - Add `POST /api/v1/webhooks/github` route.
   - Verify HMAC signature using `GITHUB_WEBHOOK_SECRET`.
   - Deduplicate deliveries via `webhook_deliveries` table.
   - Fast ACK (HTTP 200/202) followed by asynchronous event processing.
3. **Periodic Reconciliation & Cursor Tracking**:
   - Track `last_synced_commit_sha` per repository.
   - Only ingest new commits on subsequent syncs.
