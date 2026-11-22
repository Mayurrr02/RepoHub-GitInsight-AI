# RepoHub Phase 1: Code Indexing Engine Design

## 1. Overview & Objectives

The Code Indexing Engine (`backend/app/services/code_indexer.py`) transforms raw repository source trees into structured code chunks and extracted symbols tied to specific Git revisions (`commit_sha`).

Key design priorities:
1. **Safety First**: Zero indexing of binaries, secret keys, environment files, or dependency directories.
2. **Structural Awareness**: Code chunks adhere to semantic boundaries (functions, classes, methods) rather than arbitrary line cuts.
3. **Content-Hash Caching**: Chunks with unchanged SHA-256 hashes reuse existing embeddings across Git commits.
4. **Multi-Language Support**: Native Python AST parsing, structural regex parsing for common languages, and robust fallback chunking.

---

## 2. Safe File Discovery Filter

Before any file is read or processed, it passes through `is_safe_code_file(path, size_bytes)`:

### 2.1 Excluded Paths & Directories
- Dependencies & package manager dirs: `node_modules/`, `venv/`, `.venv/`, `vendor/`, `site-packages/`.
- Build & distribution outputs: `dist/`, `build/`, `out/`, `target/`, `bin/`, `obj/`.
- VCS internals: `.git/`, `.svn/`, `.hg/`.
- Cache directories: `__pycache__/`, `.cache/`, `.pytest_cache/`, `.mypy_cache/`.

### 2.2 Excluded File Extensions & Types
- Binaries & Archives: `.exe`, `.dll`, `.so`, `.dylib`, `.zip`, `.tar`, `.gz`, `.pdf`, `.png`, `.jpg`, `.svg`, `.ico`, `.woff`, `.woff2`.
- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `Pipfile.lock`, `Cargo.lock`, `go.sum`.
- Minified bundles: `*.min.js`, `*.min.css`, `*.bundle.js`.

### 2.3 Strict Secret & Sensitive File Exclusions
- Environment files: `.env`, `.env.local`, `.env.production`, `.env.*`.
- Cryptographic keys: `*.pem`, `*.key`, `*.pkcs12`, `*.pfx`, `id_rsa`, `id_ed25519`.
- Credentials: `credentials.json`, `service-account*.json`.

### 2.4 Size Boundary
Files larger than **500 KB** are rejected to prevent memory exhaustion and excessive token consumption.

---

## 3. Chunking & Parsing Strategies

The indexer employs a three-tier chunking hierarchy:

```
                  Source File Passed In
                           │
             Is language Python (.py)?
                    /             \
                  YES             NO
                  /                 \
        Python AST Parser       Structural Regex Parser
        (ast.parse)             (JS, TS, Go, Java, Rust, C++)
                  \                 /
             Parsed symbols & chunks generated?
                    /             \
                  YES             NO (or empty)
                  /                 \
         Persist Chunks        Fallback Chunker
         & Symbols             (1200 char window, 200 char overlap)
```

### 3.1 Tier 1: Python AST Parser
Utilizes Python's standard library `ast` module:
- Traverses top-level nodes for `ast.FunctionDef`, `ast.AsyncFunctionDef`, and `ast.ClassDef`.
- Accurately captures `start_line` and `end_line` coordinates.
- Extracts docstrings (`ast.get_docstring(node)`).
- Chunks preserve method and class boundaries with docstrings and signatures.

### 3.2 Tier 2: Multi-Language Structural Regex Chunker
For JavaScript, TypeScript, Go, Java, Rust, and C/C++:
- Detects patterns:
  - `class ClassName { ... }`
  - `function funcName(...) { ... }`
  - `const funcName = (...) => { ... }`
  - `func (r *Receiver) MethodName(...) { ... }`
  - `pub fn func_name(...) { ... }`
- Extracts symbol names and groups contiguous functional units into semantic chunks.

### 3.3 Tier 3: Overlapping Fallback Chunker
Applied to configuration files (YAML, JSON, Markdown, TOML) or languages without dedicated structural parsers:
- Chunks text into bounded windows of **1,200 characters** with **200 characters of overlap**.
- Ensures that function definitions or documentation spanning arbitrary byte lengths are not clipped abruptly without context.

---

## 4. Revision-Aware Scoping & Content Hashing

### 4.1 Commit Scoping
Every chunk in `code_chunks` and symbol in `code_symbols` stores:
- `repository_id`
- `commit_sha`
- `file_path`
- `start_line` / `end_line`

This allows queries to target the exact Git commit currently being inspected (e.g., matching a PR head SHA or a tagged release).

### 4.2 Content-Hash Deduplication (`content_hash`)
For every chunk:
$$\text{content\_hash} = \text{SHA-256}(\text{chunk\_content})$$

Before calling external embedding models (e.g., Google GenAI `text-embedding-004`), the indexer queries `code_chunks` for any existing row matching `content_hash`:
- **Cache Hit**: Reuses the stored `embedding_json` vector directly. Zero API calls or embedding latency incurred.
- **Cache Miss**: Generates embedding via `embeddings.py`, serializes the 768-dimensional float array, and stores both the vector and content hash.

This architecture reduces AI embedding costs and indexing latency by over 80% during iterative commits where only a few files change.
