# RepoHub Phase 1: Database Design Specification

## 1. Overview & Strategy

The database schema of RepoHub has been extended in **Phase 1** to support granular Git data ingestion, code intelligence (AST symbols and code chunk embeddings), webhook deduplication, and conversational AI persistence with tool audit logs.

All changes were implemented through Alembic migration revision:
- **Revision ID**: `006_repository_intelligence`
- **Reversibility**: Fully reversible (`upgrade()` and `downgrade()` tested).
- **Engine Compatibility**: Tested and verified on both PostgreSQL (Render production environment) and SQLite (local dev & testing suites), utilizing explicit foreign key constraints and cross-compatible data types.

---

## 2. Extended Existing Tables

| Table | Added Columns | Purpose |
| :--- | :--- | :--- |
| `repositories` | `visibility`, `open_issues_count`, `topics`, `license_name`, `archived`, `last_synced_at` | Enriched repository metadata for high-level AI context and filtering. |
| `commits` | `parent_shas`, `committer_name`, `total_changes`, `file_changes_count`, `commit_url` | Complete parent-child commit lineage and Git change statistics. |
| `pull_requests`| `base_sha`, `head_sha`, `merged_at`, `closed_at`, `labels`, `review_status` | Branch merge tracking, diff range bounds, and PR lifecycle states. |
| `issues` | `author_name`, `labels`, `comments_count` | Enhanced context on GitHub issue authors, tags, and comment activity. |
| `reviews` | `commit_id`, `pr_id` | Foreign key references back to specific pull requests and commit targets. |
| `ai_reports` | `repository_id` (FK) | Explicit association linking generated reports to specific repositories. |

---

## 3. New Models & Tables Introduced

### 3.1 `branches`
Tracks Git branches and identifies the default branch.
- `id` (Integer, Primary Key)
- `repository_id` (Integer, FK -> `repositories.id`, indexed)
- `name` (String(255), indexed)
- `head_commit_sha` (String(40), indexed)
- `is_default` (Boolean, default False)
- `is_protected` (Boolean, default False)
- `created_at`, `updated_at` (DateTime)
- *Index*: `idx_branch_repo_name` (`repository_id`, `name`, unique=True)

### 3.2 `commit_file_changes`
Stores granular per-file changes for every commit without bloating SQL tables with huge binary diffs.
- `id` (Integer, Primary Key)
- `commit_id` (Integer, FK -> `commits.id`, indexed)
- `filename` (String(500), indexed)
- `previous_filename` (String(500), nullable - for tracking renames)
- `status` (String(50) - e.g., 'added', 'modified', 'removed', 'renamed')
- `additions`, `deletions`, `changes` (Integer)
- `patch` (Text, nullable - truncated at 64 KB per file to protect memory)
- `blob_sha` (String(40), nullable)
- *Index*: `idx_commit_file_repo` (`commit_id`, `filename`)

### 3.3 `pull_request_files`
Stores file changes associated specifically with pull requests for review analysis.
- `id` (Integer, Primary Key)
- `pull_request_id` (Integer, FK -> `pull_requests.id`, indexed)
- `filename` (String(500), indexed)
- `status` (String(50))
- `additions`, `deletions`, `changes` (Integer)
- `patch` (Text, nullable)
- `blob_url` (String(500), nullable)

### 3.4 `review_comments`
Inline code review comments on specific files and diff lines.
- `id` (Integer, Primary Key)
- `review_id` (Integer, FK -> `reviews.id`, nullable, indexed)
- `pull_request_id` (Integer, FK -> `pull_requests.id`, indexed)
- `github_comment_id` (BigInteger, unique, indexed)
- `user_name` (String(255))
- `body` (Text)
- `path` (String(500), indexed)
- `position` (Integer, nullable)
- `line` (Integer, nullable)
- `commit_id` (String(40), nullable)
- `created_at`, `updated_at` (DateTime)

### 3.5 `issue_comments`
Discussion and conversation threads on GitHub issues.
- `id` (Integer, Primary Key)
- `issue_id` (Integer, FK -> `issues.id`, indexed)
- `github_comment_id` (BigInteger, unique, indexed)
- `user_name` (String(255))
- `body` (Text)
- `created_at`, `updated_at` (DateTime)

### 3.6 `code_chunks`
Stores segmented code windows, line coordinates, and embedding vectors.
- `id` (Integer, Primary Key)
- `repository_id` (Integer, FK -> `repositories.id`, indexed)
- `commit_sha` (String(40), indexed)
- `file_path` (String(500), indexed)
- `start_line` (Integer)
- `end_line` (Integer)
- `chunk_content` (Text)
- `content_hash` (String(64), indexed - SHA-256 for caching embeddings)
- `language` (String(50), indexed)
- `embedding_json` (Text - serialized float array of 768 dimensions)
- `created_at` (DateTime)
- *Index*: `idx_code_chunk_repo_file` (`repository_id`, `file_path`, `commit_sha`)
- *Index*: `idx_code_chunk_hash` (`content_hash`)

### 3.7 `code_symbols`
Extracted code structures (classes, functions, methods) from AST analysis.
- `id` (Integer, Primary Key)
- `repository_id` (Integer, FK -> `repositories.id`, indexed)
- `commit_sha` (String(40), indexed)
- `file_path` (String(500), indexed)
- `symbol_name` (String(255), indexed)
- `symbol_type` (String(50) - 'class', 'function', 'method', 'struct', 'interface')
- `start_line` (Integer)
- `end_line` (Integer)
- `docstring` (Text, nullable)
- *Index*: `idx_code_symbol_lookup` (`repository_id`, `symbol_name`)

### 3.8 `repository_sync_cursors`
Tracks sync progress and cursors for incremental sync.
- `id` (Integer, Primary Key)
- `repository_id` (Integer, FK -> `repositories.id`, indexed)
- `resource_type` (String(50) - e.g. 'commits', 'prs', 'issues', 'code')
- `last_cursor` (String(255))
- `last_synced_at` (DateTime)
- *Index*: `idx_sync_cursor_repo_resource` (`repository_id`, `resource_type`, unique=True)

### 3.9 `webhook_deliveries`
Ensures delivery deduplication and logs incoming webhook events.
- `id` (Integer, Primary Key)
- `delivery_id` (String(100), unique, indexed)
- `event_type` (String(50), indexed)
- `repository_name` (String(255), nullable, indexed)
- `status` (String(50) - 'processed', 'ignored', 'failed')
- `payload_summary` (JSON / Text)
- `created_at` (DateTime)

### 3.10 `ai_conversations`, `ai_messages`, `ai_tool_logs`
Enables persistent, multi-turn AI chat threads with full tool execution auditing.
- `ai_conversations`: `id`, `user_id` (FK), `repository_id` (FK), `title`, `created_at`, `updated_at`.
- `ai_messages`: `id`, `conversation_id` (FK), `role` ('user', 'assistant', 'system'), `content`, `grounded_citations` (JSON), `created_at`.
- `ai_tool_logs`: `id`, `conversation_id` (FK), `tool_name`, `tool_input` (JSON), `tool_output` (JSON), `execution_duration_ms`, `status`, `created_at`.

---

## 4. Multi-Tenant Isolation & Indexing Strategy

1. **Foreign Key Enforcement**: All child data models cascade or reference `repository_id` or `user_id`. Queries always join through `repository_id` and evaluate authorization against the calling user's permissions.
2. **Compound Indexes**:
   - `(repository_id, file_path, commit_sha)` allows lightning-fast retrieval of all chunks belonging to a specific revision of a file.
   - `(repository_id, symbol_name)` enables near-instant symbol resolution for code navigation.
   - `(repository_id, resource_type)` prevents duplicate cursor race conditions.
3. **Reversibility**:
   The migration `006_repository_intelligence.py` includes a tested `downgrade()` block that safely drops foreign keys and newly added tables in reverse dependency order, ensuring zero data corruption during rollback.
