import asyncio
import logging
import threading
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import (
    Branch,
    CodeChunk,
    CodeSymbol,
    Commit,
    CommitFileChange,
    Contributor,
    GitHubAccount,
    Issue,
    Language,
    PullRequest,
    Repository,
    RepositoryMetric,
    RepositorySyncCursor,
    SyncJob,
    User,
)
from app.schemas.schemas import (
    BranchOut,
    CodeHistoryItem,
    CommitDetailOut,
    CommitFileChangeOut,
    FileContentResponse,
    FileSearchHit,
    FileSearchResult,
    RepositoryDetailOut,
    RepositoryIntelligenceOut,
    RepositoryOut,
    SyncQueued,
)
from app.services.analytics import calculate_repository_metrics
from app.services.code_indexer import index_repository_revision
from app.services.retrieval import (
    check_repository_access,
    get_commit_history,
    get_file_content_bounded,
    get_repository_overview,
    search_code_semantic,
)
from app.workers.tasks import sync_repositories

logger = logging.getLogger("repohub.repositories")
router = APIRouter(prefix="/repositories", tags=["Repositories"])


@router.get("", response_model=list[RepositoryOut])
def list_repositories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Repository)
        .where(Repository.user_id == user.id)
        .order_by(Repository.updated_at.desc().nullslast())
    ).all()


@router.get("/{id}", response_model=RepositoryDetailOut)
def get_repository_detail(id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    repo = check_repository_access(db, id, user.id)

    metric = calculate_repository_metrics(db, repo)
    commits = db.scalars(
        select(Commit)
        .where(Commit.repository_id == repo.id)
        .order_by(Commit.committed_at.desc().nullslast())
    ).all()
    prs = db.scalars(select(PullRequest).where(PullRequest.repository_id == repo.id)).all()
    issues = db.scalars(select(Issue).where(Issue.repository_id == repo.id)).all()
    contributors = db.scalars(
        select(Contributor)
        .where(Contributor.repository_id == repo.id)
        .order_by(Contributor.contributions.desc())
        .limit(10)
    ).all()
    languages = db.scalars(
        select(Language)
        .where(Language.repository_id == repo.id)
        .order_by(Language.bytes.desc())
    ).all()

    total_bytes = sum(l.bytes for l in languages) or 1
    languages_out = [
        {"name": l.name, "bytes": l.bytes, "percent": round(l.bytes * 100 / total_bytes, 1)}
        for l in languages
    ]

    open_prs = sum(1 for pr in prs if pr.state == "open")
    merged_prs = sum(1 for pr in prs if pr.merged_at is not None or pr.state == "merged")
    closed_prs = sum(1 for pr in prs if pr.state == "closed" and pr.merged_at is None)

    open_issues = sum(1 for i in issues if i.state == "open")
    closed_issues = sum(1 for i in issues if i.closed_at is not None or i.state == "closed")

    recent_commits = [
        {
            "sha": c.sha,
            "message": c.message,
            "author_login": c.author_login,
            "committed_at": c.committed_at,
        }
        for c in commits[:10]
    ]

    db.commit()

    return {
        "id": repo.id,
        "github_id": repo.github_id,
        "name": repo.name,
        "full_name": repo.full_name,
        "html_url": repo.html_url,
        "clone_url": f"{repo.html_url}.git",
        "description": repo.description,
        "is_private": repo.is_private,
        "language": repo.language,
        "stars": repo.stars,
        "updated_at": repo.updated_at,
        "total_commits": len(commits),
        "open_prs": open_prs,
        "merged_prs": merged_prs,
        "closed_prs": closed_prs,
        "total_prs": len(prs),
        "open_issues": open_issues,
        "closed_issues": closed_issues,
        "total_issues": len(issues),
        "metrics": {
            "health_score": metric.health_score,
            "activity_score": metric.activity_score,
            "maintenance_score": metric.maintenance_score,
            "documentation_score": metric.documentation_score,
            "merge_rate": metric.merge_rate,
            "issue_resolution_rate": metric.issue_resolution_rate,
        },
        "languages": languages_out,
        "top_contributors": [
            {"login": c.login, "contributions": c.contributions} for c in contributors
        ],
        "recent_commits": recent_commits,
    }


@router.get("/{id}/intelligence", response_model=RepositoryIntelligenceOut)
def get_repository_intelligence(
    id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieve comprehensive repository intelligence and indexing telemetry."""
    repo = check_repository_access(db, id, user.id)
    cursor = db.scalar(select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repo.id))
    symbols_count = db.query(func.count(CodeSymbol.id)).filter(CodeSymbol.repository_id == repo.id).scalar() or 0

    return RepositoryIntelligenceOut(
        repository_id=repo.id,
        name=repo.name,
        full_name=repo.full_name,
        default_branch=repo.default_branch or "main",
        last_commit_sha=cursor.last_commit_sha if cursor else None,
        indexed_commit_sha=cursor.indexed_commit_sha if cursor else None,
        indexing_status=cursor.indexing_status if cursor else "idle",
        indexed_files_count=cursor.indexed_files_count if cursor else 0,
        indexed_chunks_count=cursor.indexed_chunks_count if cursor else 0,
        total_symbols_count=symbols_count,
        last_sync_at=cursor.last_sync_at if cursor else None,
    )


@router.get("/{id}/sync-status")
def get_sync_status(
    id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Get the latest synchronization status for a specific repository."""
    repo = check_repository_access(db, id, user.id)
    cursor = db.scalar(select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repo.id))
    latest_job = db.scalar(
        select(SyncJob)
        .where(SyncJob.user_id == user.id)
        .order_by(SyncJob.id.desc())
    )

    return {
        "repository_id": repo.id,
        "last_sync_at": cursor.last_sync_at if cursor else None,
        "last_commit_sha": cursor.last_commit_sha if cursor else None,
        "indexing_status": cursor.indexing_status if cursor else "idle",
        "last_job_status": latest_job.status if latest_job else "none",
        "last_job_error": latest_job.error if latest_job else None,
    }


@router.get("/{id}/branches", response_model=list[BranchOut])
def list_branches(
    id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """List ingested branches for the repository."""
    repo = check_repository_access(db, id, user.id)
    return db.scalars(select(Branch).where(Branch.repository_id == repo.id)).all()


@router.get("/{id}/commits", response_model=list[CommitDetailOut])
def get_repository_commits(
    id: int,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Get paginated repository commits with change statistics."""
    repo = check_repository_access(db, id, user.id)
    commits = db.scalars(
        select(Commit)
        .where(Commit.repository_id == repo.id)
        .order_by(Commit.committed_at.desc().nullslast())
        .offset(offset)
        .limit(limit)
    ).all()

    results = []
    for c in commits:
        changes = db.scalars(
            select(CommitFileChange).where(CommitFileChange.commit_id == c.id)
        ).all()
        results.append(
            CommitDetailOut(
                sha=c.sha,
                author_login=c.author_login,
                author_name=c.author_name,
                author_email=c.author_email,
                committer_name=c.committer_name,
                committer_email=c.committer_email,
                message=c.message,
                committed_at=c.committed_at,
                additions=c.additions,
                deletions=c.deletions,
                total_changes=c.total_changes,
                files_changed_count=c.files_changed_count,
                commit_url=c.commit_url,
                parent_shas=c.parent_shas,
                file_changes=[
                    CommitFileChangeOut(
                        file_path=ch.file_path,
                        status=ch.status,
                        additions=ch.additions,
                        deletions=ch.deletions,
                        changes=ch.changes,
                        patch=ch.patch,
                        previous_filename=ch.previous_filename,
                    )
                    for ch in changes
                ],
            )
        )
    return results


@router.get("/{id}/files/search", response_model=FileSearchResult)
async def search_files(
    id: int,
    q: str = Query(..., min_length=1),
    limit: int = Query(5, ge=1, le=20),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Semantic and lexical search across indexed repository files."""
    repo = check_repository_access(db, id, user.id)
    hits = await search_code_semantic(db, repo.id, user.id, q, limit=limit)
    return FileSearchResult(
        query=q,
        repository_id=repo.id,
        total_hits=len(hits),
        results=[
            FileSearchHit(
                file_path=h["file_path"],
                start_line=h["start_line"],
                end_line=h["end_line"],
                name=h.get("name"),
                chunk_type=h["chunk_type"],
                language=h["language"],
                snippet=h["snippet"],
                score=h["score"],
            )
            for h in hits
        ],
    )


@router.get("/{id}/files/content", response_model=FileContentResponse)
def get_file_content(
    id: int,
    path: str = Query(...),
    start_line: int = Query(1, ge=1),
    end_line: int = Query(100, ge=1),
    revision: str | None = Query(None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Get bounded file content from indexed repository code chunks."""
    repo = check_repository_access(db, id, user.id)
    try:
        res = get_file_content_bounded(db, repo.id, user.id, path, start_line, end_line)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not res.get("found"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{path}' not found in index.")

    return FileContentResponse(
        repository_id=repo.id,
        path=path,
        revision=revision or "HEAD",
        content=res["content"],
        size=len(res["content"]),
        total_lines=res["total_lines"],
    )


@router.get("/{id}/history")
def get_file_history(
    id: int,
    path: str = Query(...),
    limit: int = Query(15, ge=1, le=50),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Get historical commit activity for a specific file path."""
    repo = check_repository_access(db, id, user.id)
    commits = get_commit_history(db, repo.id, user.id, path=path, limit=limit)
    return {
        "repository_id": repo.id,
        "path": path,
        "commits": commits,
    }


@router.get("/{id}/health")
def get_repository_health_breakdown(
    id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Explainable repository health assessment and component scores."""
    repo = check_repository_access(db, id, user.id)
    metric = calculate_repository_metrics(db, repo)
    cursor = db.scalar(select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repo.id))

    commit_count = db.query(Commit).filter(Commit.repository_id == repo.id).count()
    pr_count = db.query(PullRequest).filter(PullRequest.repository_id == repo.id).count()
    issue_count = db.query(Issue).filter(Issue.repository_id == repo.id).count()

    return {
        "repository_id": repo.id,
        "name": repo.name,
        "health_score": metric.health_score,
        "activity_score": metric.activity_score,
        "maintenance_score": metric.maintenance_score,
        "documentation_score": metric.documentation_score,
        "merge_rate": metric.merge_rate,
        "issue_resolution_rate": metric.issue_resolution_rate,
        "factors": [
            {"name": "PR Merge Efficiency", "weight": "30%", "score": round(metric.merge_rate * 100, 1)},
            {"name": "Issue Resolution Efficiency", "weight": "30%", "score": round(metric.issue_resolution_rate * 100, 1)},
            {"name": "Git Velocity & Contribution", "weight": "40%", "score": metric.activity_score},
        ],
        "totals": {
            "commits": commit_count,
            "pull_requests": pr_count,
            "issues": issue_count,
            "indexed_files": cursor.indexed_files_count if cursor else 0,
        },
    }


@router.post("/{id}/index-code", status_code=status.HTTP_202_ACCEPTED)
async def trigger_code_index(
    id: int,
    revision: str | None = Query(None, description="Optional target commit SHA"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Trigger background code indexing for the repository."""
    repo = check_repository_access(db, id, user.id)
    if not user.github_account:
        raise HTTPException(status_code=400, detail="User does not have a connected GitHub account")

    # Run in background task / thread
    def _run_indexer():
        from app.db.session import SessionLocal
        t_db = SessionLocal()
        try:
            t_repo = t_db.get(Repository, repo.id)
            if t_repo:
                asyncio.run(index_repository_revision(t_db, t_repo, user.github_account.access_token, revision))
        finally:
            t_db.close()

    thread = threading.Thread(target=_run_indexer, daemon=True)
    thread.start()

    return {
        "status": "indexing_started",
        "repository_id": repo.id,
        "revision": revision or "HEAD",
    }


@router.post("/sync", response_model=SyncQueued, status_code=202)
def queue_sync(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not user.github_account:
        raise HTTPException(409, "No linked GitHub account")
    job = SyncJob(user_id=user.id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        sync_repositories.delay(job.id)
    except Exception as exc:
        logger.warning(
            f"Celery task dispatch failed ({exc}). Running sync asynchronously via background worker thread."
        )
        thread = threading.Thread(target=sync_repositories, args=(job.id,), daemon=True)
        thread.start()

    return SyncQueued(job_id=job.id, status=job.status)
