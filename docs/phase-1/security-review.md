# RepoHub Phase 1: Security Architecture & Review

## 1. Security Overview

As an AI-powered repository intelligence platform, RepoHub processes proprietary code, commit messages, developer discussions, and authentication credentials. Security is designed into every layer: network ingestion, storage, retrieval, and AI model orchestration.

---

## 2. Security Controls & Mechanisms

### 2.1 Multi-Tenant Isolation
- **Strict Tenant Authorization**: Every query, file retrieval, commit inspection, code search, and AI assistant interaction calls `check_repository_access(repo_id, current_user.id, db)`.
- **404 Masking**: If a user attempts to access a repository ID that does not belong to them or their organization, the API raises an HTTP 404 (Not Found) rather than HTTP 403 (Forbidden), preventing repository existence enumeration attacks.
- **SQL & Vector Isolation**: All relational queries and vector chunk searches explicitly filter by `repository_id = :repo_id`. Cross-repository information leakage is prevented at the database query level.

### 2.2 Path Traversal Prevention
- **Path Sanitization**: All file search and file content endpoints (`/api/v1/repositories/{id}/files/content`) pass input paths through strict normalization checks.
- **Traversal Rejection**:
  - Rejects any path containing `..`, absolute paths (leading `/`), or null bytes (`\0`).
  - Raises HTTP 400 Bad Request immediately if malicious traversal patterns are detected.
  - Normalizes slashes and verifies that the requested relative path remains within repository bounds.

### 2.3 Secret & Credential Protection
- **No Committed Secrets**: `.env` and local configuration files are strictly excluded from source control via `.gitignore`.
- **Zero Frontend Leakage**: GitHub OAuth tokens, personal access tokens, and Gemini API keys are never passed to the client. All GitHub and AI operations occur strictly backend-to-backend.
- **Source Indexing Blacklist**:
  - `code_indexer.py` rejects indexing of files matching `.env*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `credentials.json`, `service-account*.json`, and binary executables.
  - Prevents sensitive credentials or tokens committed in user repositories from being ingested into vector embeddings or indexed search stores.

### 2.4 Webhook Integrity & Replay Defense
- **HMAC SHA-256 Validation**:
  - The webhook endpoint (`POST /api/v1/webhooks/github`) calculates the HMAC SHA-256 signature using `settings.github_webhook_secret`.
  - Constant-time verification is enforced via `hmac.compare_digest(computed, received_signature)` to eliminate timing side-channel attacks.
  - Unsigned or incorrectly signed payloads are rejected immediately with HTTP 401 Unauthorized.
- **Delivery Idempotency**:
  - GitHub sends unique UUIDs via `X-GitHub-Delivery`.
  - Deliveries are logged in `webhook_deliveries`. Duplicate delivery attempts are acknowledged with HTTP 200 and ignored, neutralizing webhook replay attacks.

### 2.5 AI Safety & Prompt Injection Mitigation
- **System Prompt Boundaries**: The AI assistant orchestrator enforces system-level instructions that prioritize security rules over user or repository text.
- **Untrusted Code Content**: Code snippets returned from tools are treated as data, not instructions. Prompt injection attempts embedded in code comments or commit messages cannot alter the assistant's tool-calling behavior or authorization bounds.
- **Audit Logging**: Every tool execution, input parameter set, execution duration, and outcome status is permanently logged in `ai_tool_logs`.

---

## 3. Security Verification Checklist

| Security Domain | Control Implementation | Verification Status |
| :--- | :--- | :--- |
| **Tenant Isolation** | `check_repository_access` in `retrieval.py` | Verified (Automated tests pass) |
| **Path Traversal** | Normalized path checks in `repositories.py` | Verified (Automated tests pass) |
| **Secret Masking** | Whitelist in `code_indexer.py` | Verified (Automated tests pass) |
| **Webhook HMAC** | `hmac.compare_digest` in `webhooks.py` | Verified (Automated tests pass) |
| **Replay Protection** | `webhook_deliveries` unique key index | Verified (Automated tests pass) |
| **Audit Trails** | `ai_tool_logs` database persistence | Verified (Automated tests pass) |
