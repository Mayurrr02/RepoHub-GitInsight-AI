import hashlib
import hmac
import json
from app.models import Branch, Commit, Issue, PullRequest, Repository, User, WebhookDelivery
from app.services.retrieval import get_repository_overview


def sign_payload(body: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def test_webhook_hmac_and_idempotency(client, db):
    user = User(github_id=60, login="wh-user", name=None, avatar_url=None)
    db.add(user)
    db.flush()

    repo = Repository(
        user_id=user.id,
        github_id=9001,
        name="web-app",
        full_name="wh-user/web-app",
        html_url="https://github.com/wh-user/web-app",
        default_branch="main",
    )
    db.add(repo)
    db.commit()

    payload_dict = {
        "repository": {"id": 9001, "name": "web-app"},
        "ref": "refs/heads/main",
        "after": "new-sha-1234",
        "commits": [
            {
                "id": "new-sha-1234",
                "message": "fix: resolve memory leak",
                "timestamp": "2026-11-23T00:00:00Z",
                "author": {"username": "wh-user", "name": "WH User", "email": "wh@test.com"},
                "added": ["src/cache.py"],
                "modified": [],
                "removed": [],
            }
        ],
    }
    body_bytes = json.dumps(payload_dict).encode("utf-8")

    headers = {
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": "delivery-unique-001",
        "Content-Type": "application/json",
    }

    # 1. First delivery succeeds
    resp = client.post("/api/v1/webhooks/github", content=body_bytes, headers=headers)
    assert resp.status_code == 202
    assert resp.json()["status"] == "processed"

    # Verify commit was added to DB
    c = db.scalar(db.query(Commit).filter(Commit.sha == "new-sha-1234").statement)
    assert c is not None
    assert c.message == "fix: resolve memory leak"
    assert c.author_login == "wh-user"

    # Verify branch head was updated
    branch = db.scalar(db.query(Branch).filter(Branch.name == "main").statement)
    assert branch is not None
    assert branch.commit_sha == "new-sha-1234"

    # 2. Duplicate delivery with same X-GitHub-Delivery should be skipped
    resp_dup = client.post("/api/v1/webhooks/github", content=body_bytes, headers=headers)
    assert resp_dup.status_code == 202
    assert resp_dup.json()["status"] == "duplicate_skipped"


def test_webhook_pull_request_event(client, db):
    user = User(github_id=61, login="pr-user", name=None, avatar_url=None)
    db.add(user)
    db.flush()

    repo = Repository(
        user_id=user.id,
        github_id=9002,
        name="pr-repo",
        full_name="pr-user/pr-repo",
        html_url="https://github.com/pr-user/pr-repo",
    )
    db.add(repo)
    db.commit()

    pr_payload = {
        "action": "opened",
        "repository": {"id": 9002},
        "pull_request": {
            "id": 5555,
            "number": 42,
            "title": "Add Webhook Automation",
            "body": "Automates incremental sync via webhooks",
            "state": "open",
            "created_at": "2026-11-23T01:00:00Z",
            "user": {"login": "pr-user"},
            "base": {"ref": "main", "sha": "base-sha-1"},
            "head": {"ref": "feat/webhook", "sha": "head-sha-2"},
            "additions": 150,
            "deletions": 10,
            "changed_files": 4,
        },
    }

    headers = {
        "X-GitHub-Event": "pull_request",
        "X-GitHub-Delivery": "delivery-pr-001",
        "Content-Type": "application/json",
    }
    resp = client.post("/api/v1/webhooks/github", content=json.dumps(pr_payload).encode("utf-8"), headers=headers)
    assert resp.status_code == 202

    pr = db.scalar(db.query(PullRequest).filter(PullRequest.github_id == 5555).statement)
    assert pr is not None
    assert pr.number == 42
    assert pr.title == "Add Webhook Automation"
    assert pr.head_branch == "feat/webhook"
