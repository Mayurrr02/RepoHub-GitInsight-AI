# RepoHub Phase 1: Target Architecture Specification

## 1. System Overview & Product Vision

RepoHub is an AI Engineering Intelligence Platform. Phase 1 establishes the **Repository Intelligence Engine** and the **AI Repository Assistant**, upgrading RepoHub from a shallow GitHub analytics dashboard into a multi-layered code and repository intelligence system.

Phase 1 provides the shared foundation for:
1. **RepoHub Web** (current primary web surface): In-depth repository analytics, commit churn metrics, file change intelligence, and grounded conversational AI assistant with source code citations.
2. **RepoHub Intelligence Engine** (shared backend core): Continuous ingestion via webhooks, AST/symbol code indexing, deterministic content-hash embeddings, hybrid SQL/semantic retrieval, and tool-augmented LLM reasoning.
3. **Future Extension Readiness**:
   - Phase 2: Automated Pull Request Review Engine.
   - Phase 3: RepoHub IDE / VS Code Extension.

---

## 2. Target Hybrid Architecture

The intelligence platform avoids naive whole-file dumping and shallow summarization by orchestrating four complementary retrieval and analysis layers:

```
                          GitHub Platform
                   (Webhooks & REST/GraphQL API)
                                 │
                                 ▼
                     RepoHub FastAPI Gateway
                   ┌─────────────────────────┐
                   │  - HMAC Webhook Receiver│
                   │  - JWT Tenant Isolation │
                   │  - Rate Limit / Retries │
                   └────────────┬────────────┘
                                │
                                ▼
               Celery & Asynchronous Task Worker
               (Redis broker with in-memory fallback)
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
  Structured Git Ingestion                     Revision-Aware Indexer
  - Repositories & Branches                    - Safe File Discovery
  - Commits & File Diffs                       - Python AST Parser
  - PRs, Reviews & Comments                    - Structural Regex Parser
  - Issues & Issue Comments                    - SHA-256 Deduplication
  - Churn & Modification Stats                 - Embedding Generation
         │                                             │
         ▼                                             ▼
  PostgreSQL / SQLite Storage                  Vector & Symbol Storage
  (Relational schema: 20 core tables)          (CodeChunk, CodeSymbol)
         │                                             │
         └──────────────────────┬──────────────────────┘
                                │
                                ▼
                  Unified Retrieval Layer
                  (services/retrieval.py)
                  - SQL Aggregations & Metrics
                  - Hybrid Semantic & Keyword Code Search
                  - Symbol Graph Navigation
                  - Bounded File Content Retrieval
                  - Scoped Git History
                                │
                                ▼
                   AI Orchestration Engine
                   (services/ai.py & ai_tools.py)
                   - Tool Declarations & Dispatch
                   - Multi-Turn Agent Loop
                   - Grounded Source Citation Resolver
                   - Strict Anti-Hallucination Fallback
                                │
                                ▼
                   RepoHub Web UI (React 18)
                   - Repository Intelligence Dashboard
                   - Conversation Thread Management
                   - Grounded Citations & Audit Badges
```

---

## 3. Core Architectural Subsystems

### 3.1 GitHub Data Ingestion Engine
- **Full Hierarchy Ingestion**: Ingests repository metadata, branches (tracking default and head SHAs), commits with parent SHA links, commit file changes with line additions/deletions/patch status, pull requests with merge metadata, pull request files, PR review comments, and issue comments.
- **Resilient API Handling**: Implements exponential backoff on HTTP 403 (Rate Limit) and HTTP 429 (`Retry-After`), respecting secondary rate limits.
- **Incremental & Webhook-Driven**:
  - `POST /api/v1/webhooks/github` validates HMAC SHA-256 signatures (`X-Hub-Signature-256`).
  - Idempotency guaranteed via `WebhookDelivery` log and delivery IDs (`X-GitHub-Delivery`).
  - Supports `push`, `pull_request`, `issues`, `pull_request_review`, and `pull_request_review_comment` events.

### 3.2 Revision-Aware Code Indexing Engine
- **Safe Discovery Filter**:
  - Automatically skips binaries, lockfiles (`package-lock.json`, `poetry.lock`, `yarn.lock`), build directories (`dist/`, `build/`, `node_modules/`, `venv/`, `.git/`), and sensitive secret files (`.env*`, `*.pem`, `*.key`, `id_rsa`).
  - Enforces strict file size bounds (maximum 500 KB per source file).
- **Hierarchical Chunking**:
  1. *Python AST Parser*: Extracts functions, classes, and async methods with precise line boundaries and docstrings.
  2. *Structural Multi-Language Regex*: Parses JavaScript, TypeScript, Go, Java, Rust, and C/C++ top-level declarations.
  3. *Overlapping Fallback Chunker*: Slices remaining content into 1,200-character windows with 200-character overlaps.
- **Revision Scoping & Content Deduplication**:
  - Chunks and symbols are indexed and tied to the target commit SHA (`commit_sha`).
  - SHA-256 hashing on chunk content enables vector embedding reuse across commits when file content does not change.

### 3.3 Hybrid Retrieval & Storage
- **Portable Architecture**: Relational models and vector embeddings operate seamlessly across both PostgreSQL and SQLite (useful for local development and test automation).
- **Embeddings**: Uses Google GenAI `text-embedding-004` (768 dimensions) with deterministic offline fallback for air-gapped test suites. Vectors are serialized as float arrays with normalized cosine similarity calculation.
- **Tenant Isolation**: Every retrieval operation validates `check_repository_access(repo_id, user_id, db)` before touching SQL rows, vectors, or symbols.

### 3.4 AI Assistant & Tool-Calling Orchestrator
- **Declarative Tools**: The LLM interacts with the repository exclusively through strictly typed backend tools:
  1. `get_repository_overview`
  2. `search_code`
  3. `get_file_content`
  4. `get_commit_history`
  5. `get_commit_details`
  6. `get_pull_request`
  7. `get_issue`
  8. `get_contributors`
  9. `get_related_symbols`
- **Grounded Citations**: The assistant extracts and surfaces verifiable source references (file paths, exact start/end line numbers, and commit SHAs) returned by tool executions.
- **Uncertainty & Anti-Hallucination**: When evidence is missing or inconclusive, the assistant explicitly states what was searched, what was found, and the boundaries of its confidence.
- **Audit Logging**: Every tool execution, duration, status, and input parameters are persisted to `ai_tool_logs`.

---

## 4. Single-Container Deployment Fit (Render)

RepoHub preserves Render's existing single-service web configuration:
- In production, `start-render.sh` starts Uvicorn web server and Celery background worker within the same container, operating on a unified environment.
- Redis handles the Celery message broker; in test or Redis-free staging environments, asynchronous operations gracefully execute via Python daemon background threads without crashing.
- Database migrations execute automatically during startup via `alembic upgrade head`.

---

## 5. Forward Compatibility

Phase 1 provides the core API contracts and data models required for future expansion:
- **Phase 2 (Automated PR Review Engine)**: Directly leverages `PullRequestFile`, `ReviewComment`, `code_indexer.py`, and `services/retrieval.py` to compare base vs head SHAs and emit inline review comments.
- **Phase 3 (RepoHub IDE / VS Code Extension)**: Directly consumes `/api/v1/repositories/{id}/files/search`, `/api/v1/repositories/{id}/files/content`, and `/api/v1/ai/chat` endpoints using personal access tokens or OAuth credentials.
