import json
import logging
import time
from typing import Any
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.models import (
    AIToolLog,
    Commit,
    CommitFileChange,
    Contributor,
    Issue,
    Language,
    PullRequest,
    PullRequestFile,
    Repository,
    Review,
)
from app.schemas.schemas import GroundedCitation, ToolExecutionInfo
from app.services.retrieval import (
    check_repository_access,
    get_commit_details_with_diff,
    get_commit_history,
    get_file_content_bounded,
    get_repository_overview,
    get_symbols_lookup,
    search_code_semantic,
)

logger = logging.getLogger("repohub.ai_tools")

# Declarative function definitions for Gemini / OpenAI
AVAILABLE_TOOL_DECLARATIONS = [
    {
        "name": "get_repository_overview",
        "description": "Get high-level repository metadata, default branch, primary languages, commit counts, and health metrics.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
            },
            "required": ["repository_id"],
        },
    },
    {
        "name": "search_code",
        "description": "Perform semantic and symbol search across indexed source code files in the repository to locate functions, classes, or patterns.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "query": {"type": "string", "description": "Natural language or symbol search query (e.g., 'authentication middleware', 'database session')."},
                "limit": {"type": "integer", "description": "Maximum number of chunks to return (1-5).", "default": 3},
            },
            "required": ["repository_id", "query"],
        },
    },
    {
        "name": "get_file_content",
        "description": "Read a bounded line range of a source file from the repository's indexed revision.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "path": {"type": "string", "description": "Relative file path inside repository (e.g., 'backend/app/main.py')."},
                "start_line": {"type": "integer", "description": "Starting line number (default: 1).", "default": 1},
                "end_line": {"type": "integer", "description": "Ending line number (default: 100).", "default": 100},
            },
            "required": ["repository_id", "path"],
        },
    },
    {
        "name": "get_commit_history",
        "description": "Retrieve recent commits for the repository or filtered to a specific file path to see historical changes.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "path": {"type": "string", "description": "Optional file path to inspect change history for a single file."},
                "limit": {"type": "integer", "description": "Number of commits to return (max 20).", "default": 10},
            },
            "required": ["repository_id"],
        },
    },
    {
        "name": "get_commit_details",
        "description": "Inspect a specific commit by SHA, including changed files, additions, deletions, and diff patches.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "commit_sha": {"type": "string", "description": "Full or partial commit SHA."},
            },
            "required": ["repository_id", "commit_sha"],
        },
    },
    {
        "name": "get_pull_request",
        "description": "Retrieve pull request details, description, reviews, state, and changed files by PR number.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "pr_number": {"type": "integer", "description": "Pull request number (e.g., 42)."},
            },
            "required": ["repository_id", "pr_number"],
        },
    },
    {
        "name": "get_issue",
        "description": "Retrieve issue title, state, body, author, and comments by issue number.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "issue_number": {"type": "integer", "description": "Issue number (e.g., 15)."},
            },
            "required": ["repository_id", "issue_number"],
        },
    },
    {
        "name": "get_contributors",
        "description": "List top contributors and their contribution counts for this repository.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "limit": {"type": "integer", "description": "Number of contributors to return.", "default": 10},
            },
            "required": ["repository_id"],
        },
    },
    {
        "name": "get_related_symbols",
        "description": "Find function and class definitions matching a symbol name in the codebase.",
        "parameters": {
            "type": "object",
            "properties": {
                "repository_id": {"type": "integer", "description": "The internal repository ID."},
                "symbol_name": {"type": "string", "description": "Class or function name (e.g., 'User', 'sync_repositories')."},
            },
            "required": ["repository_id", "symbol_name"],
        },
    },
]


async def execute_tool(
    name: str,
    args: dict[str, Any],
    user_id: int,
    db: Session,
    conversation_id: int | None = None,
) -> tuple[dict[str, Any], list[GroundedCitation]]:
    """Securely execute a requested tool with tenant isolation and audit logging."""
    start_time = time.time()
    repo_id = args.get("repository_id")
    citations: list[GroundedCitation] = []
    result: dict[str, Any] = {}

    try:
        if not repo_id:
            raise ValueError("Missing required argument: 'repository_id'")

        # 1. Enforce repository authorization
        repo = check_repository_access(db, repo_id, user_id)

        # 2. Dispatch tool
        if name == "get_repository_overview":
            result = get_repository_overview(db, repo.id, user_id)
            citations.append(GroundedCitation(
                commit_sha=result.get("indexed_commit_sha"),
                source_type="metric",
            ))

        elif name == "search_code":
            query = args.get("query", "")
            limit = min(5, int(args.get("limit", 3)))
            chunks = await search_code_semantic(db, repo.id, user_id, query, limit=limit)
            result = {"query": query, "matches": chunks}
            for ch in chunks:
                citations.append(GroundedCitation(
                    file_path=ch["file_path"],
                    start_line=ch["start_line"],
                    end_line=ch["end_line"],
                    commit_sha=ch.get("commit_sha"),
                    source_type="code",
                ))

        elif name == "get_file_content":
            path = args.get("path", "")
            start_line = max(1, int(args.get("start_line", 1)))
            end_line = max(start_line, int(args.get("end_line", 100)))
            result = get_file_content_bounded(db, repo.id, user_id, path, start_line, end_line)
            if result.get("found"):
                citations.append(GroundedCitation(
                    file_path=result["file_path"],
                    start_line=result["start_line"],
                    end_line=result["end_line"],
                    source_type="code",
                ))

        elif name == "get_commit_history":
            path = args.get("path")
            limit = min(20, int(args.get("limit", 10)))
            commits = get_commit_history(db, repo.id, user_id, path=path, limit=limit)
            result = {"path": path, "commits": commits}
            for c in commits[:3]:
                citations.append(GroundedCitation(
                    commit_sha=c["sha"],
                    source_type="commit",
                ))

        elif name == "get_commit_details":
            sha = args.get("commit_sha", "")
            details = get_commit_details_with_diff(db, repo.id, user_id, sha)
            if details:
                result = details
                citations.append(GroundedCitation(
                    commit_sha=details["sha"],
                    source_type="commit",
                ))
            else:
                result = {"error": f"Commit '{sha}' not found in repository records."}

        elif name == "get_pull_request":
            pr_num = int(args.get("pr_number", 0))
            pr = db.scalar(
                select(PullRequest).where(
                    PullRequest.repository_id == repo.id,
                    PullRequest.number == pr_num,
                )
            )
            if pr:
                reviews = db.scalars(select(Review).where(Review.pull_request_id == pr.id)).all()
                files = db.scalars(select(PullRequestFile).where(PullRequestFile.pull_request_id == pr.id)).all()
                result = {
                    "number": pr.number,
                    "title": pr.title,
                    "body": pr.body,
                    "author": pr.author_login,
                    "state": pr.state,
                    "base_branch": pr.base_branch,
                    "head_branch": pr.head_branch,
                    "additions": pr.additions,
                    "deletions": pr.deletions,
                    "reviews": [{"reviewer": r.reviewer_login, "state": r.state, "body": r.body} for r in reviews],
                    "files": [f.file_path for f in files],
                }
                citations.append(GroundedCitation(
                    pr_number=pr.number,
                    commit_sha=pr.head_sha or pr.base_sha,
                    source_type="pull_request",
                ))
            else:
                result = {"error": f"Pull request #{pr_num} not found."}

        elif name == "get_issue":
            iss_num = int(args.get("issue_number", 0))
            issue = db.scalar(
                select(Issue).where(
                    Issue.repository_id == repo.id,
                    Issue.number == iss_num,
                )
            )
            if issue:
                result = {
                    "number": issue.number,
                    "title": issue.title,
                    "body": issue.body,
                    "author": issue.author_login,
                    "state": issue.state,
                    "created_at": issue.created_at.isoformat() if issue.created_at else None,
                }
                citations.append(GroundedCitation(
                    issue_number=issue.number,
                    source_type="issue",
                ))
            else:
                result = {"error": f"Issue #{iss_num} not found."}

        elif name == "get_contributors":
            limit = min(25, int(args.get("limit", 10)))
            conts = db.scalars(
                select(Contributor)
                .where(Contributor.repository_id == repo.id)
                .order_by(Contributor.contributions.desc())
                .limit(limit)
            ).all()
            result = {"contributors": [{"login": c.login, "contributions": c.contributions} for c in conts]}

        elif name == "get_related_symbols":
            sym_name = args.get("symbol_name", "")
            symbols = get_symbols_lookup(db, repo.id, user_id, sym_name)
            result = {"query": sym_name, "symbols": symbols}
            for s in symbols:
                citations.append(GroundedCitation(
                    file_path=s["file_path"],
                    start_line=s["start_line"],
                    end_line=s["end_line"],
                    source_type="code",
                ))

        else:
            result = {"error": f"Unknown tool: '{name}'"}

    except Exception as exc:
        logger.error(f"Error executing AI tool '{name}': {exc}")
        result = {"error": str(exc)}

    duration = round((time.time() - start_time) * 1000, 2)

    # Log tool execution to audit table
    try:
        log_entry = AIToolLog(
            conversation_id=conversation_id,
            user_id=user_id,
            repository_id=repo_id if isinstance(repo_id, int) else None,
            tool_name=name,
            arguments=json.dumps(args),
            result_summary=str(result)[:500],
            duration_ms=duration,
        )
        db.add(log_entry)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning(f"Failed to record AIToolLog: {exc}")

    return result, citations
