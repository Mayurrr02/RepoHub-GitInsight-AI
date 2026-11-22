# RepoHub Phase 1: GitHub Ingestion Engine Design

## 1. Overview & Objectives

The GitHub Ingestion Engine is responsible for continuously synchronizing and ingesting complete repository state into RepoHub. Rather than collecting superficial metadata, Phase 1 establishes an in-depth Git extraction pipeline that pulls historical commits, parent lineage, file-level modifications, diff stats, pull requests, review threads, issue discussions, and source code trees.

---

## 2. Ingestion Pipeline Stages

```
[Initial Import / Webhook Trigger]
                │
                ▼
  1. Repository Metadata & Branches
     - Ingests visibility, topics, license, open issues count
     - Ingests branches, default branch designation, head commit SHAs
                │
                ▼
  2. Commits & File Modification History
     - Paginated commit fetch with parent SHA lineage
     - File-level diff changes (additions, deletions, status, patch up to 64KB)
     - Aggregation of code churn and file modification frequency
                │
                ▼
  3. Pull Requests, Reviews & Comments
     - Ingests PRs, head/base SHAs, merge commit SHAs, labels, states
     - Ingests PR changed files list
     - Ingests PR reviews & granular inline review comments (file/line/body)
                │
                ▼
  4. Issues & Issue Discussions
     - Ingests open & closed issues, labels, authors
     - Ingests issue comment threads
                │
                ▼
  5. Source Tree & Revision-Aware Code Indexing
     - Fetches repository tree (recursive or directory traversal)
     - Passes source files to `code_indexer.py`
     - Chunks, extracts AST symbols, computes embeddings
```

---

## 3. Resilience, Rate Limiting & Backoff

GitHub REST API endpoints enforce secondary and primary rate limits (typically 5,000 requests/hour for authenticated users or GitHub Apps). The ingestion engine in `backend/app/services/github.py` implements:

1. **Exponential Backoff**:
   - Inspects `X-RateLimit-Remaining` and `X-RateLimit-Reset` response headers.
   - On HTTP 403 (Rate Limit Exceeded) or HTTP 429 (Too Many Requests), pauses worker execution until reset timestamp or backs off with exponential jitter (up to 3 retries).
2. **Safe Fallbacks & Timeouts**:
   - All network calls via `httpx.AsyncClient` configure explicit timeouts (`connect=10s`, `read=30s`).
   - If a specific auxiliary resource fails (e.g., individual commit diff unavailable or deleted branch), the pipeline logs a warning and proceeds without crashing the overall repository sync.
3. **Cursor-Based Incremental Sync**:
   - `repository_sync_cursors` maintains the latest processed commit SHA or timestamp per resource (`commits`, `pull_requests`, `issues`). Subsequent sync passes query `since=<last_synced_at>` to fetch only deltas.

---

## 4. Webhook Ingestion & Deduplication

### 4.1 Endpoint Specification
- **Route**: `POST /api/v1/webhooks/github`
- **Headers Verified**:
  - `X-Hub-Signature-256`: HMAC SHA-256 signature calculated over the raw request payload using `settings.github_webhook_secret`.
  - `X-GitHub-Event`: Event type (`push`, `pull_request`, `issues`, `pull_request_review`, `ping`).
  - `X-GitHub-Delivery`: Unique UUID for the delivery.

### 4.2 Security & HMAC Verification
The raw request payload bytes are verified against the header using `hmac.compare_digest` to prevent timing attacks. If the signature is invalid or absent, the request is rejected immediately with HTTP 401 Unauthorized.

### 4.3 Idempotency & Deduplication
Every incoming event delivery is verified against the `webhook_deliveries` table. If `delivery_id` is already recorded:
- The request immediately returns HTTP 200 with `{"status": "ignored", "message": "Duplicate delivery"}`.
- Prevents redundant background worker queuing and duplicate writes during GitHub webhook retries.

### 4.4 Supported Webhook Event Types

| Event | Actions Handled | Engine Response |
| :--- | :--- | :--- |
| `ping` | Initial ping | Logs receipt and returns pong confirmation. |
| `push` | Code committed to branch | Triggers incremental commit ingestion and schedules code indexing on the new `head_commit` SHA. |
| `pull_request` | `opened`, `synchronize`, `closed` | Updates PR record, ingests PR file changes, updates merge status, triggers indexing if target is default branch. |
| `pull_request_review` | `submitted`, `edited` | Ingests or updates review body and review approval state. |
| `pull_request_review_comment`| `created`, `edited` | Ingests inline code review comment and links to PR and file path. |
| `issues` | `opened`, `closed`, `reopened` | Synchronizes issue title, state, and labels. |
| `issue_comment` | `created`, `edited` | Synchronizes issue discussion comment thread. |

---

## 5. Storage Strategy for Large Diffs

To prevent database bloat and performance degradation:
- Commit patches and diffs larger than 64 KB are truncated with a marker `"... [diff truncated for storage efficiency] ..."`.
- Blob references (`blob_sha`) are preserved, enabling on-demand raw content retrieval from GitHub when complete diff inspection is required.
