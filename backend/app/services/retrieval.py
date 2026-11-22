import json
import logging
from typing import Any
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.models import (
    Branch,
    CodeChunk,
    CodeSymbol,
    Commit,
    CommitFileChange,
    Contributor,
    Issue,
    Language,
    PullRequest,
    Repository,
    RepositoryMetric,
    RepositorySyncCursor,
    User,
)
from app.services.embeddings import cosine_similarity, embedding_service

logger = logging.getLogger("repohub.retrieval")


def check_repository_access(db: Session, repository_id: int, user_id: int) -> Repository:
    """Enforce strict tenant isolation: user owns repo or belongs to org that has repo."""
    repo = db.scalar(
        select(Repository).where(Repository.id == repository_id, Repository.user_id == user_id)
    )
    if not repo:
        # Check organization repository membership
        from app.models import OrganizationMember, OrganizationRepository
        org_repo = db.scalar(
            select(OrganizationRepository)
            .join(OrganizationMember, OrganizationMember.organization_id == OrganizationRepository.organization_id)
            .where(
                OrganizationRepository.repository_id == repository_id,
                OrganizationMember.user_id == user_id,
            )
        )
        if org_repo:
            repo = db.get(Repository, repository_id)

    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )
    return repo


def get_repository_overview(db: Session, repository_id: int, user_id: int) -> dict[str, Any]:
    """Retrieve structured SQL overview of the repository."""
    repo = check_repository_access(db, repository_id, user_id)
    cursor = db.scalar(select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repo.id))
    branches = db.scalars(select(Branch).where(Branch.repository_id == repo.id)).all()
    metric = db.scalar(select(RepositoryMetric).where(RepositoryMetric.repository_id == repo.id))
    languages = db.scalars(select(Language).where(Language.repository_id == repo.id).order_by(Language.bytes.desc())).all()
    contributors = db.scalars(select(Contributor).where(Contributor.repository_id == repo.id).order_by(Contributor.contributions.desc()).limit(10)).all()

    commit_count = db.query(Commit).filter(Commit.repository_id == repo.id).count()
    pr_count = db.query(PullRequest).filter(PullRequest.repository_id == repo.id).count()
    issue_count = db.query(Issue).filter(Issue.repository_id == repo.id).count()

    total_bytes = sum(l.bytes for l in languages) or 1
    lang_dist = [{"name": l.name, "bytes": l.bytes, "percent": round(l.bytes * 100 / total_bytes, 1)} for l in languages]

    return {
        "repository_id": repo.id,
        "name": repo.name,
        "full_name": repo.full_name,
        "html_url": repo.html_url,
        "description": repo.description,
        "is_private": repo.is_private,
        "primary_language": repo.language,
        "default_branch": repo.default_branch or "main",
        "stars": repo.stars,
        "total_commits": commit_count,
        "total_pull_requests": pr_count,
        "total_issues": issue_count,
        "indexed_commit_sha": cursor.indexed_commit_sha if cursor else None,
        "indexing_status": cursor.indexing_status if cursor else "idle",
        "indexed_files_count": cursor.indexed_files_count if cursor else 0,
        "indexed_chunks_count": cursor.indexed_chunks_count if cursor else 0,
        "health_score": metric.health_score if metric else 0.0,
        "activity_score": metric.activity_score if metric else 0.0,
        "maintenance_score": metric.maintenance_score if metric else 0.0,
        "merge_rate": metric.merge_rate if metric else 0.0,
        "issue_resolution_rate": metric.issue_resolution_rate if metric else 0.0,
        "languages": lang_dist,
        "branches": [b.name for b in branches],
        "top_contributors": [{"login": c.login, "contributions": c.contributions} for c in contributors],
    }


async def search_code_semantic(
    db: Session,
    repository_id: int,
    user_id: int,
    query: str,
    limit: int = 5,
    revision: str | None = None,
) -> list[dict[str, Any]]:
    """Hybrid semantic and lexical search across indexed repository code chunks."""
    repo = check_repository_access(db, repository_id, user_id)

    query_embedding = await embedding_service.get_embedding(query)
    q_terms = [t.lower() for t in query.split() if len(t) > 2]

    # Query candidate chunks for this repo
    stmt = select(CodeChunk).where(CodeChunk.repository_id == repo.id)
    if revision:
        stmt = stmt.where(CodeChunk.commit_sha == revision)

    chunks = db.scalars(stmt).all()
    if not chunks:
        return []

    scored_results = []
    for chunk in chunks:
        # Lexical score
        lex_score = 0.0
        text_lower = chunk.content.lower()
        path_lower = chunk.file_path.lower()
        name_lower = (chunk.name or "").lower()

        for term in q_terms:
            prefix = term[:4] if len(term) >= 4 else term
            if term in name_lower or (len(prefix) >= 4 and prefix in name_lower):
                lex_score += 0.4
            if term in path_lower or (len(prefix) >= 4 and prefix in path_lower):
                lex_score += 0.3
            if term in text_lower or (len(prefix) >= 4 and prefix in text_lower):
                lex_score += 0.2

        # Semantic score
        sem_score = 0.0
        if chunk.embedding:
            try:
                emb_vals = json.loads(chunk.embedding)
                sem_score = cosine_similarity(query_embedding, emb_vals)
            except Exception:
                sem_score = 0.0

        combined_score = (sem_score * 0.6) + (min(1.0, lex_score) * 0.4)
        if combined_score > 0.05 or lex_score > 0:
            scored_results.append((combined_score, chunk))

    scored_results.sort(key=lambda x: x[0], reverse=True)
    top_hits = scored_results[:limit]

    return [
        {
            "id": c.id,
            "file_path": c.file_path,
            "commit_sha": c.commit_sha,
            "start_line": c.start_line,
            "end_line": c.end_line,
            "language": c.language,
            "chunk_type": c.chunk_type,
            "name": c.name,
            "snippet": c.content[:1500],
            "score": round(score, 4),
        }
        for score, c in top_hits
    ]


def get_file_content_bounded(
    db: Session,
    repository_id: int,
    user_id: int,
    path: str,
    start_line: int = 1,
    end_line: int = 100,
) -> dict[str, Any]:
    """Retrieve bounded line range of a specific file from stored code chunks."""
    repo = check_repository_access(db, repository_id, user_id)

    # Sanitize path
    clean_path = path.strip().lstrip("/")
    if ".." in clean_path:
        raise ValueError("Invalid file path: path traversal is not permitted")

    chunks = db.scalars(
        select(CodeChunk)
        .where(CodeChunk.repository_id == repo.id, CodeChunk.file_path == clean_path)
        .order_by(CodeChunk.start_line.asc())
    ).all()

    if not chunks:
        return {
            "file_path": clean_path,
            "found": False,
            "content": f"File '{clean_path}' not found in indexed revision.",
            "total_lines": 0,
        }

    # Reconstruct lines
    file_lines: dict[int, str] = {}
    for chunk in chunks:
        c_lines = chunk.content.splitlines()
        for idx, line in enumerate(c_lines):
            curr_lineno = chunk.start_line + idx
            file_lines[curr_lineno] = line

    if not file_lines:
        return {"file_path": clean_path, "found": False, "content": "", "total_lines": 0}

    max_line = max(file_lines.keys())
    s_line = max(1, start_line)
    e_line = min(max_line, end_line if end_line > 0 else s_line + 100)

    selected_lines = [
        f"{ln:4d} | {file_lines.get(ln, '')}" for ln in range(s_line, e_line + 1)
    ]

    return {
        "file_path": clean_path,
        "found": True,
        "start_line": s_line,
        "end_line": e_line,
        "total_lines": max_line,
        "content": "\n".join(selected_lines),
    }


def get_commit_history(
    db: Session,
    repository_id: int,
    user_id: int,
    path: str | None = None,
    limit: int = 15,
) -> list[dict[str, Any]]:
    """Retrieve commit history for repository or scoped to a specific file path."""
    repo = check_repository_access(db, repository_id, user_id)

    if path:
        clean_path = path.strip().lstrip("/")
        commits = db.scalars(
            select(Commit)
            .join(CommitFileChange, CommitFileChange.commit_id == Commit.id)
            .where(Commit.repository_id == repo.id, CommitFileChange.file_path == clean_path)
            .order_by(Commit.committed_at.desc())
            .limit(limit)
        ).all()
    else:
        commits = db.scalars(
            select(Commit)
            .where(Commit.repository_id == repo.id)
            .order_by(Commit.committed_at.desc())
            .limit(limit)
        ).all()

    return [
        {
            "sha": c.sha,
            "message": c.message.splitlines()[0] if c.message else "",
            "author": c.author_login or c.author_name,
            "date": c.committed_at.isoformat() if c.committed_at else None,
            "additions": c.additions,
            "deletions": c.deletions,
            "url": c.commit_url,
        }
        for c in commits
    ]


def get_commit_details_with_diff(
    db: Session,
    repository_id: int,
    user_id: int,
    commit_sha: str,
) -> dict[str, Any] | None:
    """Retrieve detailed commit information including changed files and diff patches."""
    repo = check_repository_access(db, repository_id, user_id)

    commit = db.scalar(
        select(Commit).where(
            Commit.repository_id == repo.id,
            or_(Commit.sha == commit_sha, Commit.sha.startswith(commit_sha)),
        )
    )
    if not commit:
        return None

    changes = db.scalars(
        select(CommitFileChange).where(CommitFileChange.commit_id == commit.id)
    ).all()

    return {
        "sha": commit.sha,
        "author_login": commit.author_login,
        "author_name": commit.author_name,
        "committer_name": commit.committer_name,
        "message": commit.message,
        "committed_at": commit.committed_at.isoformat() if commit.committed_at else None,
        "additions": commit.additions,
        "deletions": commit.deletions,
        "total_changes": commit.total_changes,
        "files_changed_count": commit.files_changed_count,
        "commit_url": commit.commit_url,
        "file_changes": [
            {
                "file_path": ch.file_path,
                "status": ch.status,
                "additions": ch.additions,
                "deletions": ch.deletions,
                "patch": ch.patch[:3000] if ch.patch else None,
            }
            for ch in changes
        ],
    }


def get_symbols_lookup(
    db: Session,
    repository_id: int,
    user_id: int,
    symbol_name: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Lookup code symbols by exact name or prefix."""
    repo = check_repository_access(db, repository_id, user_id)
    symbols = db.scalars(
        select(CodeSymbol)
        .where(
            CodeSymbol.repository_id == repo.id,
            or_(
                CodeSymbol.name == symbol_name,
                CodeSymbol.name.ilike(f"%{symbol_name}%"),
            ),
        )
        .limit(limit)
    ).all()

    return [
        {
            "name": s.name,
            "kind": s.kind,
            "file_path": s.file_path,
            "start_line": s.start_line,
            "end_line": s.end_line,
            "signature": s.signature,
            "docstring": s.docstring,
        }
        for s in symbols
    ]
