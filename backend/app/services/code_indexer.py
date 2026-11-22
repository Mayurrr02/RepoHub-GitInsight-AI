import ast
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from app.models import CodeChunk, CodeSymbol, Repository, RepositorySyncCursor
from app.services.github import fetch_file_content, fetch_repository_tree

logger = logging.getLogger("repohub.indexer")

# File & Directory exclusion sets
EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    "build",
    "dist",
    "vendor",
    "target",
    ".next",
    ".nuxt",
    ".cache",
    ".idea",
    ".vscode",
}

EXCLUDED_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "Cargo.lock",
    "Gemfile.lock",
    "composer.lock",
    ".DS_Store",
    "Thumbs.db",
}

SECRET_PATTERNS = [
    re.compile(r"^\.env(\..+)?$", re.IGNORECASE),
    re.compile(r".*\.pem$", re.IGNORECASE),
    re.compile(r".*\.key$", re.IGNORECASE),
    re.compile(r"id_rsa.*", re.IGNORECASE),
    re.compile(r"id_ed25519.*", re.IGNORECASE),
]

LANGUAGE_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".json": "json",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
}

MAX_FILE_SIZE = 500 * 1024  # 500 KB limit for semantic indexing


def should_skip_file(path: str) -> bool:
    """Determine if a file should be excluded from code indexing."""
    parts = path.replace("\\", "/").split("/")
    filename = parts[-1]

    for part in parts[:-1]:
        if part in EXCLUDED_DIRS or part.startswith("."):
            return True

    if filename in EXCLUDED_FILES:
        return True

    for pattern in SECRET_PATTERNS:
        if pattern.match(filename):
            return True

    # Check extension
    dot_index = filename.rfind(".")
    if dot_index == -1:
        return True
    ext = filename[dot_index:].lower()
    return ext not in LANGUAGE_EXTENSIONS


def is_binary(content: bytes) -> bool:
    """Check if content has null bytes indicating a binary file."""
    return b"\x00" in content[:8000]


def detect_language(path: str) -> str:
    dot_index = path.rfind(".")
    if dot_index != -1:
        ext = path[dot_index:].lower()
        return LANGUAGE_EXTENSIONS.get(ext, "text")
    return "text"


def hash_content(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class ExtractedChunk:
    def __init__(self, name: str | None, chunk_type: str, start_line: int, end_line: int, content: str):
        self.name = name
        self.chunk_type = chunk_type
        self.start_line = start_line
        self.end_line = end_line
        self.content = content


class ExtractedSymbol:
    def __init__(self, name: str, kind: str, start_line: int, end_line: int, signature: str | None = None, docstring: str | None = None):
        self.name = name
        self.kind = kind
        self.start_line = start_line
        self.end_line = end_line
        self.signature = signature
        self.docstring = docstring


def parse_python_structural(content: str) -> tuple[list[ExtractedChunk], list[ExtractedSymbol]]:
    """Parse Python source code using AST to produce semantic chunks and symbols."""
    chunks: list[ExtractedChunk] = []
    symbols: list[ExtractedSymbol] = []
    lines = content.splitlines()

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return parse_fallback_chunks(lines, "python"), []

    module_doc = ast.get_docstring(tree)
    if module_doc:
        doc_lines = len(module_doc.splitlines())
        chunks.append(ExtractedChunk(
            name="module_docstring",
            chunk_type="module",
            start_line=1,
            end_line=min(len(lines), doc_lines + 2),
            content="\n".join(lines[:doc_lines + 2]),
        ))

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            start = node.lineno
            end = node.end_lineno or start
            chunk_text = "\n".join(lines[start - 1:end])
            doc = ast.get_docstring(node)
            chunks.append(ExtractedChunk(
                name=node.name,
                chunk_type="class",
                start_line=start,
                end_line=end,
                content=chunk_text,
            ))
            symbols.append(ExtractedSymbol(
                name=node.name,
                kind="class",
                start_line=start,
                end_line=end,
                signature=f"class {node.name}",
                docstring=doc,
            ))

            # Inner methods
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    m_start = item.lineno
                    m_end = item.end_lineno or m_start
                    m_text = "\n".join(lines[m_start - 1:m_end])
                    m_doc = ast.get_docstring(item)
                    chunks.append(ExtractedChunk(
                        name=f"{node.name}.{item.name}",
                        chunk_type="method",
                        start_line=m_start,
                        end_line=m_end,
                        content=m_text,
                    ))
                    symbols.append(ExtractedSymbol(
                        name=f"{node.name}.{item.name}",
                        kind="method",
                        start_line=m_start,
                        end_line=m_end,
                        signature=f"def {item.name}(...)",
                        docstring=m_doc,
                    ))

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = node.lineno
            end = node.end_lineno or start
            chunk_text = "\n".join(lines[start - 1:end])
            doc = ast.get_docstring(node)
            chunks.append(ExtractedChunk(
                name=node.name,
                chunk_type="function",
                start_line=start,
                end_line=end,
                content=chunk_text,
            ))
            symbols.append(ExtractedSymbol(
                name=node.name,
                kind="function",
                start_line=start,
                end_line=end,
                signature=f"def {node.name}(...)",
                docstring=doc,
            ))

    if not chunks:
        return parse_fallback_chunks(lines, "python"), symbols

    return chunks, symbols


# Regex patterns for structural symbols in JS, TS, Go, Rust, Java
GENERIC_DECLARATIONS = [
    # JavaScript / TypeScript
    (re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*(\([^\)]*\))", re.MULTILINE), "function"),
    (re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+[A-Za-z0-9_$]+)?", re.MULTILINE), "class"),
    (re.compile(r"^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)", re.MULTILINE), "interface"),
    (re.compile(r"^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=", re.MULTILINE), "type"),
    (re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^\)]*\)\s*=>", re.MULTILINE), "function"),
    # Go
    (re.compile(r"^func\s+(?:\([^\)]+\)\s+)?([A-Za-z0-9_]+)\s*(\([^\)]*\))", re.MULTILINE), "function"),
    (re.compile(r"^type\s+([A-Za-z0-9_]+)\s+struct", re.MULTILINE), "class"),
    # Rust
    (re.compile(r"^\s*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)\s*(\([^\)]*\))", re.MULTILINE), "function"),
    (re.compile(r"^\s*(?:pub\s+)?struct\s+([A-Za-z0-9_]+)", re.MULTILINE), "class"),
    (re.compile(r"^\s*impl(?:\s+[A-Za-z0-9_]+)?\s+for\s+([A-Za-z0-9_]+)", re.MULTILINE), "class"),
    # Java / C#
    (re.compile(r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+([A-Za-z0-9_]+)", re.MULTILINE), "class"),
]


def parse_generic_structural(content: str, language: str) -> tuple[list[ExtractedChunk], list[ExtractedSymbol]]:
    """Parse other languages using structural regex boundary matching."""
    lines = content.splitlines()
    symbols: list[ExtractedSymbol] = []
    breakpoints: list[tuple[int, str, str]] = []

    for pattern, kind in GENERIC_DECLARATIONS:
        for match in pattern.finditer(content):
            name = match.group(1)
            line_num = content[:match.start()].count("\n") + 1
            breakpoints.append((line_num, name, kind))

    breakpoints.sort(key=lambda x: x[0])

    if not breakpoints:
        return parse_fallback_chunks(lines, language), []

    chunks: list[ExtractedChunk] = []
    total_lines = len(lines)

    for i, (start_line, name, kind) in enumerate(breakpoints):
        end_line = breakpoints[i + 1][0] - 1 if i + 1 < len(breakpoints) else total_lines
        chunk_text = "\n".join(lines[start_line - 1:end_line])
        chunks.append(ExtractedChunk(
            name=name,
            chunk_type=kind,
            start_line=start_line,
            end_line=end_line,
            content=chunk_text,
        ))
        symbols.append(ExtractedSymbol(
            name=name,
            kind=kind,
            start_line=start_line,
            end_line=end_line,
            signature=f"{kind} {name}",
        ))

    return chunks, symbols


def parse_fallback_chunks(lines: list[str], language: str, chunk_size: int = 50, overlap: int = 10) -> list[ExtractedChunk]:
    """Sliding window fallback for text, markdown, or unstructured files."""
    chunks: list[ExtractedChunk] = []
    total_lines = len(lines)
    if total_lines == 0:
        return []

    step = max(1, chunk_size - overlap)
    for start in range(0, total_lines, step):
        end = min(total_lines, start + chunk_size)
        chunk_lines = lines[start:end]
        chunks.append(ExtractedChunk(
            name=f"lines_{start + 1}_{end}",
            chunk_type="fallback",
            start_line=start + 1,
            end_line=end,
            content="\n".join(chunk_lines),
        ))
        if end >= total_lines:
            break

    return chunks


def extract_chunks_and_symbols(filepath: str, content: str) -> tuple[list[ExtractedChunk], list[ExtractedSymbol]]:
    """Route file to language-appropriate chunker."""
    lang = detect_language(filepath)
    if lang == "python":
        return parse_python_structural(content)
    elif lang in ("javascript", "typescript", "go", "rust", "java", "csharp", "cpp", "c", "php"):
        chunks, symbols = parse_generic_structural(content, lang)
        if not chunks:
            chunks = parse_fallback_chunks(content.splitlines(), lang)
        return chunks, symbols
    else:
        return parse_fallback_chunks(content.splitlines(), lang), []


async def index_repository_revision(
    db: Session,
    repository: Repository,
    access_token: str,
    target_sha: str | None = None,
) -> dict:
    """Index an entire repository revision into code chunks and symbols."""
    # 1. Determine revision SHA
    commit_sha = target_sha
    if not commit_sha:
        cursor = db.scalar(
            select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repository.id)
        )
        if cursor and cursor.last_commit_sha:
            commit_sha = cursor.last_commit_sha
        else:
            from app.models import Commit
            latest = db.scalar(
                select(Commit.sha)
                .where(Commit.repository_id == repository.id)
                .order_by(Commit.committed_at.desc())
            )
            commit_sha = latest or "HEAD"

    # Update cursor to running
    cursor = db.scalar(
        select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repository.id)
    )
    if not cursor:
        cursor = RepositorySyncCursor(
            repository_id=repository.id,
            indexing_status="running",
            indexed_commit_sha=commit_sha,
        )
        db.add(cursor)
    else:
        cursor.indexing_status = "running"
        cursor.indexed_commit_sha = commit_sha
    db.commit()

    logger.info(f"Starting code indexing for {repository.full_name} at commit {commit_sha}")

    try:
        # 2. Fetch Git tree
        tree_items = await fetch_repository_tree(access_token, repository.full_name, commit_sha)
        candidate_files = [
            item["path"] for item in tree_items
            if item.get("type") == "blob" and not should_skip_file(item.get("path", ""))
        ]

        # Prioritize top 50 source files to keep initial index bounded and responsive
        prioritized_files = candidate_files[:50]
        logger.info(f"Found {len(candidate_files)} source files. Indexing top {len(prioritized_files)}.")

        # Remove existing chunks/symbols for this specific revision if re-indexing
        db.execute(
            delete(CodeChunk).where(
                CodeChunk.repository_id == repository.id,
                CodeChunk.commit_sha == commit_sha,
            )
        )
        db.execute(
            delete(CodeSymbol).where(
                CodeSymbol.repository_id == repository.id,
                CodeSymbol.commit_sha == commit_sha,
            )
        )
        db.commit()

        total_chunks = 0
        total_symbols = 0
        indexed_files = 0

        for file_path in prioritized_files:
            content = await fetch_file_content(access_token, repository.full_name, file_path, ref=commit_sha)
            if not content or len(content.encode("utf-8")) > MAX_FILE_SIZE:
                continue

            lang = detect_language(file_path)
            chunks, symbols = extract_chunks_and_symbols(file_path, content)

            for chunk in chunks:
                c_hash = hash_content(chunk.content)
                # Check for existing embedding with the same content hash in this repo
                existing_emb = db.scalar(
                    select(CodeChunk.embedding)
                    .where(CodeChunk.repository_id == repository.id, CodeChunk.content_hash == c_hash)
                    .limit(1)
                )

                chunk_obj = CodeChunk(
                    repository_id=repository.id,
                    commit_sha=commit_sha,
                    file_path=file_path,
                    start_line=chunk.start_line,
                    end_line=chunk.end_line,
                    language=lang,
                    chunk_type=chunk.chunk_type,
                    name=chunk.name,
                    content_hash=c_hash,
                    content=chunk.content,
                    embedding=existing_emb,
                )
                db.add(chunk_obj)
                total_chunks += 1

            for sym in symbols:
                sym_obj = CodeSymbol(
                    repository_id=repository.id,
                    commit_sha=commit_sha,
                    file_path=file_path,
                    name=sym.name,
                    kind=sym.kind,
                    start_line=sym.start_line,
                    end_line=sym.end_line,
                    signature=sym.signature,
                    docstring=sym.docstring,
                )
                db.add(sym_obj)
                total_symbols += 1

            indexed_files += 1

        cursor.indexing_status = "completed"
        cursor.indexed_commit_sha = commit_sha
        cursor.indexed_files_count = indexed_files
        cursor.indexed_chunks_count = total_chunks
        cursor.last_sync_at = datetime.now(timezone.utc)
        cursor.last_error = None
        db.commit()

        logger.info(
            f"Successfully indexed {repository.full_name}: {indexed_files} files, {total_chunks} chunks, {total_symbols} symbols."
        )

        return {
            "status": "completed",
            "commit_sha": commit_sha,
            "indexed_files": indexed_files,
            "indexed_chunks": total_chunks,
            "indexed_symbols": total_symbols,
        }

    except Exception as exc:
        logger.error(f"Failed to index repository {repository.full_name}: {exc}")
        cursor.indexing_status = "failed"
        cursor.last_error = str(exc)
        db.commit()
        return {
            "status": "failed",
            "error": str(exc),
        }
