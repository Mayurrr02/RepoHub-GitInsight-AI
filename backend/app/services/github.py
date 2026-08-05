from datetime import datetime
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Commit, Contributor, Issue, Language, PullRequest, Release, Repository, Review

GITHUB_API = "https://api.github.com"

async def exchange_code(code: str) -> dict:
    from app.core.config import get_settings
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        response = await client.post("https://github.com/login/oauth/access_token", headers={"Accept": "application/json"}, data={"client_id": settings.github_client_id, "client_secret": settings.github_client_secret, "code": code})
        response.raise_for_status()
        return response.json()

async def fetch_user(access_token: str) -> dict:
    async with httpx.AsyncClient(headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}) as client:
        response = await client.get(f"{GITHUB_API}/user")
        response.raise_for_status()
        return response.json()

async def fetch_repositories(access_token: str) -> list[dict]:
    async with httpx.AsyncClient(headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}) as client:
        response = await client.get(f"{GITHUB_API}/user/repos", params={"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator,organization_member"})
        response.raise_for_status()
        return response.json()

async def fetch_repository_data(access_token: str, full_name: str) -> dict:
    """Retrieve the Phase 2 API resources for one repository (first 100 each)."""
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    async with httpx.AsyncClient(headers=headers) as client:
        async def get(path: str):
            response = await client.get(f"{GITHUB_API}/repos/{full_name}/{path}", params={"per_page": 100, "state": "all"})
            response.raise_for_status(); return response.json()
        commits, pulls, issues, releases, contributors, languages, branches = await __import__('asyncio').gather(get("commits"), get("pulls"), get("issues"), get("releases"), get("contributors"), get("languages"), get("branches"))
        reviews = await __import__('asyncio').gather(*[get(f"pulls/{pr['number']}/reviews") for pr in pulls]) if pulls else []
        return {"commits": commits, "pulls": pulls, "issues": [item for item in issues if "pull_request" not in item], "releases": releases, "contributors": contributors, "languages": languages, "branches": branches, "reviews": reviews}

def persist_repositories(db: Session, user_id: int, repos: list[dict]) -> int:
    existing = {repo.github_id: repo for repo in db.scalars(select(Repository).where(Repository.user_id == user_id))}
    for item in repos:
        values = {"name": item["name"], "full_name": item["full_name"], "html_url": item["html_url"], "description": item.get("description"), "is_private": item.get("private", False), "language": item.get("language"), "stars": item.get("stargazers_count", 0), "updated_at": datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00")) if item.get("updated_at") else None}
        repo = existing.get(item["id"])
        if repo:
            for key, value in values.items(): setattr(repo, key, value)
        else:
            db.add(Repository(user_id=user_id, github_id=item["id"], **values))
    db.commit()
    return len(repos)

def _upsert(db: Session, model, filters: dict, values: dict):
    item = db.query(model).filter_by(**filters).one_or_none()
    if item:
        for key, value in values.items(): setattr(item, key, value)
    else: db.add(model(**filters, **values))

def _time(value: str | None):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None

def persist_repository_data(db: Session, repository: Repository, data: dict) -> None:
    for item in data["commits"]:
        _upsert(db, Commit, {"repository_id": repository.id, "sha": item["sha"]}, {"author_login": item.get("author", {}).get("login") if item.get("author") else None, "message": item["commit"]["message"], "committed_at": _time(item["commit"]["author"]["date"])})
    pull_map = {}
    for item in data["pulls"]:
        _upsert(db, PullRequest, {"repository_id": repository.id, "github_id": item["id"]}, {"number": item["number"], "author_login": item.get("user", {}).get("login"), "state": item["state"], "created_at": _time(item["created_at"]), "merged_at": _time(item.get("merged_at")), "closed_at": _time(item.get("closed_at"))})
    db.flush()
    for pr in db.query(PullRequest).filter_by(repository_id=repository.id): pull_map[pr.number] = pr
    for item, review_list in zip(data["pulls"], data["reviews"]):
        for review in review_list:
            _upsert(db, Review, {"pull_request_id": pull_map[item["number"]].id, "github_id": review["id"]}, {"reviewer_login": review.get("user", {}).get("login"), "state": review["state"], "submitted_at": _time(review.get("submitted_at"))})
    for item in data["issues"]:
        _upsert(db, Issue, {"repository_id": repository.id, "github_id": item["id"]}, {"state": item["state"], "created_at": _time(item["created_at"]), "closed_at": _time(item.get("closed_at"))})
    for item in data["releases"]:
        _upsert(db, Release, {"repository_id": repository.id, "github_id": item["id"]}, {"name": item.get("name") or item.get("tag_name"), "published_at": _time(item.get("published_at"))})
    for item in data["contributors"]:
        _upsert(db, Contributor, {"repository_id": repository.id, "github_id": item["id"]}, {"login": item["login"], "contributions": item.get("contributions", 0)})
    db.query(Language).filter_by(repository_id=repository.id).delete()
    for name, size in data["languages"].items(): db.add(Language(repository_id=repository.id, name=name, bytes=size))
    db.commit()
