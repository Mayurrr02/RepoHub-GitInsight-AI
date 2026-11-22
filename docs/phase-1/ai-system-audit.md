# AI System Audit & Retrieval Evaluation

## 1. Existing AI Implementation

### Architecture
- **Location**: `backend/app/services/ai.py` & `backend/app/api/routes/ai.py`.
- **SDK & Provider**: Google GenAI Python SDK (`google-genai` 3.6.1), calling Gemini with model configured via `GEMINI_MODEL` (default: `gemini-3.5-flash`).
- **Prompt Structure**:
  - System instruction: `"You are a precise engineering career analyst. Use only provided GitHub analytics."`
  - Context payload: Single summary string concatenated from developer metrics:
    ```
    Developer: {user.login}. Developer metrics: {developer}. Repositories: {metrics}. Languages: {languages}.
    ```
  - Prompt: User's question or fallback career guidance prompt.

---

## 2. Technical Evaluation of Existing AI Layer

| Capability | Current State | Target Requirement for Phase 1 | Status |
|---|---|---|---|
| **Repository Scoping** | Global user level only | Scope queries to specific repository and branch/revision | Missing |
| **Code Understanding** | None | Index files, functions, classes, and symbols | Missing |
| **Semantic Retrieval (RAG)** | None | Chunk source files, generate embeddings, perform vector search | Missing |
| **Grounded Citations** | None (pure LLM prose) | Cite file paths, line numbers, commit SHAs, PR numbers | Missing |
| **Tool Calling / Function Calling** | None | Backend tool orchestrator (search_code, get_commit, etc.) | Missing |
| **Conversation Persistence** | Frontend only (lost on refresh) | Database-persisted threads, messages, and tool logs | Missing |
| **Streaming Responses** | Standard blocking JSON | SSE or chunked streaming for real-time token delivery | Missing |
| **Prompt Injection Protection** | None | Sanitize repository content; treat code/diffs as untrusted | Missing |
| **Deterministic SQL Retrieval** | Inline string summary | Specialized SQL tools for commit stats, contributor counts | Missing |

---

## 3. Tool Calling & Agentic Architecture Needs

The AI Assistant must not guess commit SHAs, author dates, or code logic. It must use controlled backend tools.

Target Tools:
1. `get_repository_overview(repository_id)`: Metadata, default branch, primary language, stats.
2. `get_repository_statistics(repository_id, days)`: Commit volume, PR volume, merge times.
3. `search_code(repository_id, query, limit)`: Semantic / symbol search across indexed source files.
4. `get_file_content(repository_id, path, revision)`: Bounded line-range retrieval for specific files.
5. `get_commit_history(repository_id, path, limit)`: Commits touching a path or repository root.
6. `get_commit_details(repository_id, commit_sha)`: Commit author, message, changed files, diff patches.
7. `compare_commits(repository_id, base_sha, head_sha)`: Files changed, additions/deletions diff.
8. `get_pull_request(repository_id, pr_number)`: Title, state, body, author, reviews, changed files.
9. `get_issue(repository_id, issue_number)`: Title, state, body, comments.
10. `get_contributors(repository_id, limit)`: Top contributors and contribution counts.
11. `get_related_symbols(repository_id, symbol_name)`: Class and function symbol declarations.
12. `get_repository_languages(repository_id)`: Language byte distribution.

Security constraints for tools:
- Strictly enforce user repository ownership or organization membership before executing any tool.
- Validate file paths to prevent directory traversal (`..`, absolute paths outside repo).
- Bound response sizes to prevent token context explosion.
- Prevent execution of code or arbitrary database queries.

---

## 4. Embedding & Vector Retrieval Strategy

- **Embedding Model**: Gemini Embeddings (`text-embedding-004`) via Google GenAI SDK (or OpenAI `text-embedding-3-small` as configurable provider).
- **Storage Strategy**:
  - In PostgreSQL with `pgvector` extension when available.
  - Portable fallback: Stored embedding vectors (JSON/array) with cosine similarity in Python/SQL, ensuring seamless operation on environments without custom C extensions (e.g., standard Render Postgres or SQLite).
- **Chunking Algorithm**:
  - Language-aware chunking: Split by functions, classes, and logical declaration blocks.
  - Fallback chunking: Sliding window with line overlap for non-AST supported languages.
  - Deduplication: SHA-256 hash of chunk content to prevent redundant embedding calls and reduce API costs.
