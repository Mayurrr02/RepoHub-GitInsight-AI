import asyncio
import json
import logging
import base64
from datetime import datetime, timezone
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import (
    Branch,
    Commit,
    CommitFileChange,
    Contributor,
    Issue,
    IssueComment,
    Language,
    PullRequest,
    PullRequestFile,
    Release,
    Repository,
    RepositorySyncCursor,
    Review,
    ReviewComment,
)

logger = logging.getLogger("repohub.github")
GITHUB_API = "https://api.github.com"


async def exchange_code(code: str) -> dict:
    from app.core.config import get_settings
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
        )
        response.raise_for_status()
        return response.json()


async def fetch_user(access_token: str) -> dict:
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        timeout=15.0,
    ) as client:
        response = await client.get(f"{GITHUB_API}/user")
        response.raise_for_status()
        return response.json()


async def fetch_repositories(access_token: str) -> list[dict]:
    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
        timeout=20.0,
    ) as client:
        response = await client.get(
            f"{GITHUB_API}/user/repos",
            params={"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator,organization_member"},
        )
        response.raise_for_status()
        return response.json()


async def _github_request(client: httpx.AsyncClient, url: str, params: dict | None = None, retries: int = 2) -> httpx.Response | None:
    """Execute GitHub API request with exponential backoff and rate-limit handling."""
    for attempt in range(retries + 1):
        try:
            response = await client.get(url, params=params)
            if response.status_code == 429 or (response.status_code == 403 and "rate limit" in response.text.lower()):
                retry_after = int(response.headers.get("retry-after", "2"))
                logger.warning(f"GitHub rate limit encountered on {url}. Backing off for {retry_after}s.")
                await asyncio.sleep(min(retry_after, 5))
                continue
            return response
        except (httpx.RequestError, httpx.TimeoutException) as exc:
            if attempt == retries:
                logger.warning(f"GitHub request failed permanently for {url}: {exc}")
                return None
            await asyncio.sleep(1.0 * (attempt + 1))
    return None


async def fetch_file_content(access_token: str, full_name: str, path: str, ref: str | None = None) -> str | None:
    """Retrieve raw file content from GitHub repository."""
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    params = {}
    if ref:
        params["ref"] = ref

    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        resp = await _github_request(client, f"{GITHUB_API}/repos/{full_name}/contents/{path.lstrip('/')}", params=params)
        if not resp or resp.status_code != 200:
            return None
        payload = resp.json()
        if isinstance(payload, dict) and "content" in payload and payload.get("encoding") == "base64":
            try:
                return base64.b64decode(payload["content"]).decode("utf-8", errors="replace")
            except Exception:
                return None
    return None


async def fetch_repository_tree(access_token: str, full_name: str, sha: str) -> list[dict]:
    """Retrieve recursive Git tree for a commit SHA."""
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
        resp = await _github_request(client, f"{GITHUB_API}/repos/{full_name}/git/trees/{sha}", params={"recursive": "1"})
        if not resp or resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("tree", []) if isinstance(data, dict) else []


async def fetch_repository_data(access_token: str, full_name: str, max_items: int = 100) -> dict:
    """Retrieve comprehensive Phase 1 repository resources."""
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
        async def get(path: str, default=None, params=None):
            req_params = {"per_page": 100, "state": "all"}
            if params:
                req_params.update(params)
            resp = await _github_request(client, f"{GITHUB_API}/repos/{full_name}/{path}", params=req_params)
            if not resp or resp.status_code in (404, 409, 204):
                return default if default is not None else ([] if path != "languages" else {})
            if resp.status_code >= 400:
                return default if default is not None else ([] if path != "languages" else {})
            try:
                return resp.json()
            except Exception:
                return default if default is not None else ([] if path != "languages" else {})

        # Fetch base resources concurrently
        repo_meta, commits_raw, pulls_raw, issues_raw, releases_raw, contributors_raw, languages_raw, branches_raw = await asyncio.gather(
            get("", default={}),
            get("commits"),
            get("pulls"),
            get("issues"),
            get("releases"),
            get("contributors"),
            get("languages", default={}),
            get("branches"),
        )

        pulls = pulls_raw if isinstance(pulls_raw, list) else []
        commits = commits_raw if isinstance(commits_raw, list) else []

        # Filter out pull requests from issues response
        pure_issues = [
            item for item in (issues_raw if isinstance(issues_raw, list) else [])
            if isinstance(item, dict) and "pull_request" not in item
        ]

        # Fetch PR details (reviews, review comments, and files) for top PRs
        reviews_tasks = [get(f"pulls/{pr['number']}/reviews") for pr in pulls[:25] if isinstance(pr, dict) and "number" in pr]
        review_comments_tasks = [get(f"pulls/{pr['number']}/comments") for pr in pulls[:25] if isinstance(pr, dict) and "number" in pr]
        pr_files_tasks = [get(f"pulls/{pr['number']}/files") for pr in pulls[:25] if isinstance(pr, dict) and "number" in pr]

        reviews_results = await asyncio.gather(*reviews_tasks) if reviews_tasks else []
        review_comments_results = await asyncio.gather(*review_comments_tasks) if review_comments_tasks else []
        pr_files_results = await asyncio.gather(*pr_files_tasks) if pr_files_tasks else []

        # Fetch commit details (with file patches) for top 25 commits
        commit_details_tasks = [
            get(f"commits/{c['sha']}") for c in commits[:25] if isinstance(c, dict) and "sha" in c
        ]
        commit_details_results = await asyncio.gather(*commit_details_tasks) if commit_details_tasks else []

        # Fetch issue comments for top 25 issues
        issue_comments_tasks = [
            get(f"issues/{issue['number']}/comments") for issue in pure_issues[:25] if isinstance(issue, dict) and "number" in issue
        ]
        issue_comments_results = await asyncio.gather(*issue_comments_tasks) if issue_comments_tasks else []

        return {
            "metadata": repo_meta if isinstance(repo_meta, dict) else {},
            "commits": commits,
            "commit_details": commit_details_results,
            "pulls": pulls,
            "pr_files": pr_files_results,
            "issues": pure_issues,
            "issue_comments": issue_comments_results,
            "releases": releases_raw if isinstance(releases_raw, list) else [],
            "contributors": contributors_raw if isinstance(contributors_raw, list) else [],
            "languages": languages_raw if isinstance(languages_raw, dict) else {},
            "branches": branches_raw if isinstance(branches_raw, list) else [],
            "reviews": reviews_results,
            "review_comments": review_comments_results,
        }


def persist_repositories(db: Session, user_id: int, repos: list[dict]) -> int:
    existing = {repo.github_id: repo for repo in db.scalars(select(Repository).where(Repository.user_id == user_id))}
    for item in repos:
        values = {
            "name": item["name"],
            "full_name": item["full_name"],
            "html_url": item["html_url"],
            "description": item.get("description"),
            "is_private": item.get("private", False),
            "language": item.get("language"),
            "stars": item.get("stargazers_count", 0),
            "default_branch": item.get("default_branch", "main"),
            "updated_at": datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00")) if item.get("updated_at") else None,
        }
        repo = existing.get(item["id"])
        if repo:
            for key, value in values.items():
                setattr(repo, key, value)
        else:
            db.add(Repository(user_id=user_id, github_id=item["id"], **values))
    db.commit()
    return len(repos)


def _upsert(db: Session, model, filters: dict, values: dict):
    item = db.query(model).filter_by(**filters).one_or_none()
    if item:
        for key, value in values.items():
            setattr(item, key, value)
        return item
    else:
        new_item = model(**filters, **values)
        db.add(new_item)
        return new_item


def _time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def persist_repository_data(db: Session, repository: Repository, data: dict) -> None:
    # 1. Update Repository Metadata
    meta = data.get("metadata", {})
    if isinstance(meta, dict) and meta:
        if "default_branch" in meta and meta["default_branch"]:
            repository.default_branch = meta["default_branch"]
        if "description" in meta and meta["description"]:
            repository.description = meta["description"]
        if "stargazers_count" in meta:
            repository.stars = meta["stargazers_count"]

    # 2. Persist Branches
    default_branch_name = repository.default_branch or "main"
    for branch_data in data.get("branches", []):
        if not isinstance(branch_data, dict) or "name" not in branch_data:
            continue
        branch_name = branch_data["name"]
        commit_sha = branch_data.get("commit", {}).get("sha", "") if isinstance(branch_data.get("commit"), dict) else ""
        is_default = (branch_name == default_branch_name)
        is_protected = branch_data.get("protected", False)

        _upsert(
            db,
            Branch,
            {"repository_id": repository.id, "name": branch_name},
            {
                "commit_sha": commit_sha,
                "is_default": is_default,
                "is_protected": is_protected,
                "updated_at": datetime.now(timezone.utc),
            },
        )
    db.flush()

    # 3. Index detailed commits map
    details_map = {}
    for detail in data.get("commit_details", []):
        if isinstance(detail, dict) and "sha" in detail:
            details_map[detail["sha"]] = detail

    # Persist Commits
    commit_obj_map = {}
    for item in data.get("commits", []):
        if not isinstance(item, dict) or "sha" not in item:
            continue
        sha = item["sha"]
        detail = details_map.get(sha, {})

        commit_data = item.get("commit", {})
        author_data = commit_data.get("author", {}) if isinstance(commit_data, dict) else {}
        committer_data = commit_data.get("committer", {}) if isinstance(commit_data, dict) else {}

        date_str = None
        if isinstance(author_data, dict):
            date_str = author_data.get("date")
        if not date_str and isinstance(committer_data, dict):
            date_str = committer_data.get("date")

        login = None
        if item.get("author") and isinstance(item["author"], dict):
            login = item["author"].get("login")
        elif item.get("committer") and isinstance(item["committer"], dict):
            login = item["committer"].get("login")

        message = commit_data.get("message", "") if isinstance(commit_data, dict) else ""

        # Parent SHAs
        parent_list = [p["sha"] for p in item.get("parents", []) if isinstance(p, dict) and "sha" in p]
        parent_shas_json = json.dumps(parent_list) if parent_list else None

        # Stats from detail
        stats = detail.get("stats", {}) if isinstance(detail, dict) else {}
        additions = stats.get("additions", 0)
        deletions = stats.get("deletions", 0)
        total_changes = stats.get("total", additions + deletions)
        files = detail.get("files", []) if isinstance(detail, dict) else []
        files_count = len(files)

        author_name = author_data.get("name") if isinstance(author_data, dict) else None
        author_email = author_data.get("email") if isinstance(author_data, dict) else None
        committer_name = committer_data.get("name") if isinstance(committer_data, dict) else None
        committer_email = committer_data.get("email") if isinstance(committer_data, dict) else None

        c_obj = _upsert(
            db,
            Commit,
            {"repository_id": repository.id, "sha": sha},
            {
                "author_login": login,
                "author_name": author_name,
                "author_email": author_email,
                "committer_name": committer_name,
                "committer_email": committer_email,
                "message": message,
                "committed_at": _time(date_str) or datetime.now(timezone.utc),
                "parent_shas": parent_shas_json,
                "additions": additions,
                "deletions": deletions,
                "total_changes": total_changes,
                "files_changed_count": files_count,
                "commit_url": item.get("html_url"),
            },
        )
        commit_obj_map[sha] = c_obj

        # Persist commit file changes if detail provided files
        if files:
            db.flush()
            for f in files:
                if not isinstance(f, dict) or "filename" not in f:
                    continue
                # Truncate oversized patches to preserve DB performance (< 100KB)
                raw_patch = f.get("patch")
                patch = raw_patch[:100000] if raw_patch else None
                _upsert(
                    db,
                    CommitFileChange,
                    {"commit_id": c_obj.id, "file_path": f["filename"]},
                    {
                        "repository_id": repository.id,
                        "status": f.get("status", "modified"),
                        "additions": f.get("additions", 0),
                        "deletions": f.get("deletions", 0),
                        "changes": f.get("changes", 0),
                        "patch": patch,
                        "previous_filename": f.get("previous_filename"),
                        "blob_sha": f.get("sha"),
                    },
                )

    db.flush()

    # 4. Persist Pull Requests
    pull_map = {}
    pr_files_map = {}
    for idx, pr_files in enumerate(data.get("pr_files", [])):
        if idx < len(data.get("pulls", [])):
            pr_item = data.get("pulls")[idx]
            if isinstance(pr_item, dict) and "number" in pr_item:
                pr_files_map[pr_item["number"]] = pr_files

    for item in data.get("pulls", []):
        if not isinstance(item, dict) or "id" not in item:
            continue
        number = item["number"]
        base_data = item.get("base", {}) if isinstance(item.get("base"), dict) else {}
        head_data = item.get("head", {}) if isinstance(item.get("head"), dict) else {}
        labels = [l["name"] for l in item.get("labels", []) if isinstance(l, dict) and "name" in l]

        pr_obj = _upsert(
            db,
            PullRequest,
            {"repository_id": repository.id, "github_id": item["id"]},
            {
                "number": number,
                "title": item.get("title"),
                "body": item.get("body"),
                "author_login": item.get("user", {}).get("login") if item.get("user") else None,
                "state": item.get("state", "open"),
                "created_at": _time(item.get("created_at")) or datetime.now(timezone.utc),
                "merged_at": _time(item.get("merged_at")),
                "closed_at": _time(item.get("closed_at")),
                "base_branch": base_data.get("ref"),
                "head_branch": head_data.get("ref"),
                "base_sha": base_data.get("sha"),
                "head_sha": head_data.get("sha"),
                "merge_commit_sha": item.get("merge_commit_sha"),
                "labels": json.dumps(labels) if labels else None,
            },
        )
        pull_map[number] = pr_obj

        # Persist PR files
        files_for_pr = pr_files_map.get(number, [])
        if files_for_pr and isinstance(files_for_pr, list):
            db.flush()
            for f in files_for_pr:
                if not isinstance(f, dict) or "filename" not in f:
                    continue
                raw_patch = f.get("patch")
                patch = raw_patch[:50000] if raw_patch else None
                _upsert(
                    db,
                    PullRequestFile,
                    {"pull_request_id": pr_obj.id, "file_path": f["filename"]},
                    {
                        "status": f.get("status", "modified"),
                        "additions": f.get("additions", 0),
                        "deletions": f.get("deletions", 0),
                        "patch": patch,
                    },
                )

    db.flush()

    # 5. Persist Reviews and Review Comments
    review_comments_map = {}
    for idx, comments in enumerate(data.get("review_comments", [])):
        if idx < len(data.get("pulls", [])):
            pr_item = data.get("pulls")[idx]
            if isinstance(pr_item, dict) and "number" in pr_item:
                review_comments_map[pr_item["number"]] = comments

    for idx, review_list in enumerate(data.get("reviews", [])):
        if idx >= len(data.get("pulls", [])):
            break
        pr_item = data.get("pulls")[idx]
        if not isinstance(pr_item, dict) or pr_item.get("number") not in pull_map:
            continue
        pr_record = pull_map[pr_item["number"]]

        for review in (review_list if isinstance(review_list, list) else []):
            if not isinstance(review, dict) or "id" not in review:
                continue
            r_obj = _upsert(
                db,
                Review,
                {"pull_request_id": pr_record.id, "github_id": review["id"]},
                {
                    "reviewer_login": review.get("user", {}).get("login") if review.get("user") else None,
                    "state": review.get("state", "COMMENTED"),
                    "submitted_at": _time(review.get("submitted_at")),
                    "body": review.get("body"),
                    "commit_sha": review.get("commit_id"),
                },
            )

        # Persist inline review comments for this PR
        comments_for_pr = review_comments_map.get(pr_item["number"], [])
        if comments_for_pr and isinstance(comments_for_pr, list):
            db.flush()
            for c in comments_for_pr:
                if not isinstance(c, dict) or "id" not in c:
                    continue
                _upsert(
                    db,
                    ReviewComment,
                    {"pull_request_id": pr_record.id, "github_id": c["id"]},
                    {
                        "review_id": None,
                        "path": c.get("path"),
                        "line": c.get("line") or c.get("original_line"),
                        "commit_sha": c.get("commit_id"),
                        "body": c.get("body", ""),
                        "author_login": c.get("user", {}).get("login") if c.get("user") else None,
                        "created_at": _time(c.get("created_at")) or datetime.now(timezone.utc),
                    },
                )

    # 6. Persist Issues and Issue Comments
    issue_comments_map = {}
    for idx, comments in enumerate(data.get("issue_comments", [])):
        if idx < len(data.get("issues", [])):
            issue_item = data.get("issues")[idx]
            if isinstance(issue_item, dict) and "number" in issue_item:
                issue_comments_map[issue_item["number"]] = comments

    for item in data.get("issues", []):
        if not isinstance(item, dict) or "id" not in item:
            continue
        number = item.get("number")
        labels = [l["name"] for l in item.get("labels", []) if isinstance(l, dict) and "name" in l]
        iss_obj = _upsert(
            db,
            Issue,
            {"repository_id": repository.id, "github_id": item["id"]},
            {
                "number": number,
                "title": item.get("title"),
                "body": item.get("body"),
                "author_login": item.get("user", {}).get("login") if item.get("user") else None,
                "state": item.get("state", "open"),
                "labels": json.dumps(labels) if labels else None,
                "created_at": _time(item.get("created_at")) or datetime.now(timezone.utc),
                "closed_at": _time(item.get("closed_at")),
                "updated_at": _time(item.get("updated_at")),
            },
        )
        if number and number in issue_comments_map:
            db.flush()
            for c in issue_comments_map[number]:
                if not isinstance(c, dict) or "id" not in c:
                    continue
                _upsert(
                    db,
                    IssueComment,
                    {"issue_id": iss_obj.id, "github_id": c["id"]},
                    {
                        "author_login": c.get("user", {}).get("login") if c.get("user") else None,
                        "body": c.get("body", ""),
                        "created_at": _time(c.get("created_at")) or datetime.now(timezone.utc),
                    },
                )

    # 7. Persist Releases
    for item in data.get("releases", []):
        if not isinstance(item, dict) or "id" not in item:
            continue
        _upsert(
            db,
            Release,
            {"repository_id": repository.id, "github_id": item["id"]},
            {
                "name": item.get("name") or item.get("tag_name", ""),
                "published_at": _time(item.get("published_at")),
            },
        )

    # 8. Persist Contributors
    for item in data.get("contributors", []):
        if not isinstance(item, dict) or "id" not in item:
            continue
        _upsert(
            db,
            Contributor,
            {"repository_id": repository.id, "github_id": item["id"]},
            {
                "login": item.get("login", ""),
                "contributions": item.get("contributions", 0),
            },
        )

    # 9. Persist Languages
    db.query(Language).filter_by(repository_id=repository.id).delete()
    if isinstance(data.get("languages"), dict):
        for name, size in data["languages"].items():
            db.add(Language(repository_id=repository.id, name=name, bytes=size))

    # 10. Update Sync Cursor
    latest_sha = data.get("commits", [{}])[0].get("sha") if data.get("commits") else None
    cursor = db.scalar(select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repository.id))
    if not cursor:
        cursor = RepositorySyncCursor(
            repository_id=repository.id,
            default_branch=repository.default_branch or "main",
            last_commit_sha=latest_sha,
            last_sync_at=datetime.now(timezone.utc),
            indexing_status="idle",
        )
        db.add(cursor)
    else:
        cursor.default_branch = repository.default_branch or "main"
        if latest_sha:
            cursor.last_commit_sha = latest_sha
        cursor.last_sync_at = datetime.now(timezone.utc)

    db.commit()
