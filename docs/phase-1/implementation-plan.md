# Phase 1 Master Implementation Plan

## 1. Objectives & Scope

Phase 1 elevates RepoHub from a basic Git analytics dashboard into a comprehensive **Repository Intelligence Engine + AI Repository Assistant**.

### Key Deliverables:
1. **GitHub Ingestion Engine**: Complete historical data ingestion including branches, parent commits, commit file changes, PR details, PR files, review comments, issue details, and comments.
2. **Incremental Webhook Synchronization**: Idempotent GitHub webhook receiver with HMAC signature verification, delivery tracking, and reconciliation.
3. **Repository-Aware Database Models & Migrations**: Add non-destructive, reversible Alembic migrations for expanded Git entities, code chunks, symbols, conversations, and webhook logs.
4. **Codebase Intelligence Engine**: Revision-aware source file discovery, AST and structural parsing, symbol extraction, chunking, and content-hash caching.
5. **Hybrid Semantic & SQL Retrieval**: Combining structured PostgreSQL data, vector embeddings, and Git history into bounded, grounded context packets.
6. **AI Repository Assistant**: Controlled tool-calling agent orchestrator with grounded citations (file paths, line numbers, commit SHAs), streaming responses, and conversation persistence.
7. **Repository Health Analytics & Reports**: Deepened analytics (churn, turnaround time, ownership) and repository-scoped report generation.
8. **Frontend Upgrades**: Modernized AI Assistant UI with repository selection, revision context, streaming responses, tool execution indicators, grounded source citations, and sync telemetry.
9. **Automated Testing & Security Hardening**: Unit, integration, security, and tenant-isolation test suites.
10. **Render Deployment Guide**: Full documentation of production requirements.

---

## 2. Phased Execution Roadmap

### Step 1: Stage Zero Audit & Documentation (Completed)
- Inspect codebase, frontend, backend, database, deployment, and existing tests.
- Produce comprehensive audit documentation in `docs/phase-1/`.

### Step 2: Database Design & Migration (Alembic 006)
- Design extended tables and columns in `app/models/models.py`:
  - `branches`, `commit_file_changes`, `pull_request_files`, `review_comments`, `issue_comments`.
  - `code_chunks`, `code_symbols`, `repository_sync_cursors`.
  - `webhook_deliveries`.
  - `ai_conversations`, `ai_messages`, `ai_tool_logs`.
- Author reversible migration `006_repository_intelligence.py`.
- Run migrations on test/local database and verify schema integrity.

### Step 3: Comprehensive GitHub Data Ingestion Layer
- Enhance `backend/app/services/github.py`:
  - Fetch complete metadata, branches, and tags.
  - Paginated commit ingestion with author identities, parent SHAs, additions/deletions, and commit file changes.
  - Paginated PR ingestion with diff patches, base/head SHAs, and PR files.
  - Ingest reviews and review comments with line numbers and diff references.
  - Ingest issues and issue comments.
  - Robust error handling: exponential backoff for secondary rate limits, respectful Retry-After handling.

### Step 4: Webhook Receiver & Incremental Sync Engine
- Create `backend/app/api/routes/webhooks.py`:
  - HMAC SHA-256 signature verification (`X-Hub-Signature-256`).
  - Idempotency check with `webhook_deliveries` (`X-GitHub-Delivery`).
  - Handle `push`, `pull_request`, `pull_request_review`, `issues`, and `release` events.
  - Incremental processing: re-index changed files and update affected commit/PR records without re-importing the entire repository.
- Wire webhook route into `backend/app/api/router.py`.

### Step 5: Codebase Indexing & AST Symbol Engine
- Create `backend/app/services/code_indexer.py`:
  - Safe file discovery filtering out binaries, vendor directories (`node_modules`, `venv`, `build`), lockfiles, and secrets (`.env`, `.pem`, `id_rsa`).
  - Structural and language-aware chunking (functions, classes, blocks) with overlapping fallback for all major languages.
  - Symbol extraction (class, function, method names, line numbers).
  - Revision-aware indexing: chunks and symbols tied to specific `commit_sha`.
  - Content-hash deduplication (`content_hash`) to avoid re-chunking and re-embedding unchanged files.

### Step 6: Embeddings & Hybrid Retrieval Engine
- Create `backend/app/services/embeddings.py`:
  - Unified embedding provider abstraction (Google GenAI `text-embedding-004` / fallback to OpenAI or local deterministic embeddings).
  - Batch embedding generation with content hash caching.
- Create `backend/app/services/retrieval.py`:
  - Hybrid retrieval combining:
    1. Structured SQL queries (metrics, commits, PRs, issues, contributors).
    2. Semantic vector code chunk similarity.
    3. Symbol and dependency lookup.
    4. Historical Git diff inspection.
  - Strict tenant and repository boundary enforcement.

### Step 7: Controlled AI Tool Calling & Agent Orchestrator
- Create `backend/app/services/ai_tools.py`:
  - Declarative tool definitions with strict Pydantic schemas:
    - `get_repository_overview`
    - `get_repository_statistics`
    - `search_code`
    - `get_file_content`
    - `get_commit_history`
    - `get_commit_details`
    - `compare_commits`
    - `get_pull_request`
    - `get_issue`
    - `get_contributors`
    - `get_related_symbols`
    - `get_repository_languages`
  - Strict authorization and path validation on every tool call.
- Upgrade `backend/app/services/ai.py`:
  - Re-architect `generate_insights` into a multi-turn, tool-calling agent orchestrator using Gemini tool calling / structured function execution.
  - Enforce grounded answer construction: cite file paths, line ranges, and commit SHAs; explicitly communicate uncertainty when evidence is missing.

### Step 8: Upgraded AI & Intelligence API Endpoints
- Extend `backend/app/api/routes/ai.py` & `backend/app/api/routes/repositories.py`:
  - `POST /api/v1/ai/chat`: Supports repository ID, revision, multi-turn messages, conversation persistence, and grounded citation metadata.
  - `GET /api/v1/ai/conversations`: List persisted conversations for user.
  - `GET /api/v1/ai/conversations/{id}`: Retrieve message history and tool executions.
  - `DELETE /api/v1/ai/conversations/{id}`: Delete conversation thread.
  - `GET /api/v1/repositories/{id}/intelligence`: Repository architecture summary, indexed commit SHA, symbol counts, and sync cursors.
  - `GET /api/v1/repositories/{id}/files/search`: Search indexed files and code.
  - `GET /api/v1/repositories/{id}/files/content`: Fetch file content at revision.
  - `GET /api/v1/repositories/{id}/history`: File modification history and code churn.
  - `POST /api/v1/repositories/{id}/reports`: Generate repository-specific intelligence report.

### Step 9: Extended Analytics & Engineering Health
- Extend `backend/app/services/analytics.py`:
  - Code churn metrics (additions vs deletions over time).
  - Most frequently modified files/hotspots.
  - PR turnaround times and open PR aging.
  - Explainable repository health breakdown.

### Step 10: Frontend Modernization
- Upgrade `frontend/src/api/ai.ts` and `frontend/src/api/repositories.ts` to connect to new endpoints.
- Modernize `frontend/src/pages/IntelligencePage.tsx`:
  - Repository selector dropdown.
  - Conversation history drawer / sidebar.
  - Grounded source references card (expandable file/line citations).
  - Tool execution badges ("Searching code...", "Inspecting commit...").
- Enhance `frontend/src/pages/RepositoriesPage.tsx`:
  - Display indexing status, indexed commit SHA, and sync cursor telemetry.
  - Code search and file change inspector in repository modal.
- Enhance `frontend/src/pages/ReportsPage.tsx`:
  - Repository-specific report selector and health breakdown.

### Step 11: Testing & Security Verification
- Unit tests: GitHub parser, chunker, symbol extractor, tool authorization, tenant isolation, content hashing.
- Integration tests: Webhook processing, code indexing, hybrid retrieval, tool execution, conversation lifecycle.
- Security tests: Directory traversal, prompt injection sanitization, unauthorized repo access, fake webhook signatures.
- Execute full test suite and verify 100% pass rate.

### Step 12: Final Deliverables & Documentation
- Author complete Phase 1 deliverable documentation in `docs/phase-1/`.
- Provide implementation report and verification logs.
