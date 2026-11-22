import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    Branch,
    Commit,
    CommitFileChange,
    Issue,
    IssueComment,
    PullRequest,
    Repository,
    RepositorySyncCursor,
    Review,
    ReviewComment,
    WebhookDelivery,
)
from app.schemas.schemas import WebhookIngestOut

logger = logging.getLogger("repohub.webhooks")
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


def verify_github_signature(payload: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify HMAC SHA-256 signature from GitHub webhook header."""
    if not secret:
        # If no secret configured in environment, allow in development but warn
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected_signature = signature_header.split("sha256=")[1]
    computed_signature = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_signature, computed_signature)


def _parse_time(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return None


def process_webhook_payload(db: Session, event: str, payload: dict, delivery_id: str) -> None:
    """Process GitHub webhook event incrementally and idempotently."""
    repo_data = payload.get("repository", {})
    github_repo_id = repo_data.get("id")
    if not github_repo_id:
        return

    # Find matching repository
    repositories = db.scalars(select(Repository).where(Repository.github_id == github_repo_id)).all()
    if not repositories:
        logger.info(f"Received webhook for untracked repository github_id={github_repo_id}")
        return

    action = payload.get("action")

    for repository in repositories:
        if event == "push":
            ref = payload.get("ref", "")
            head_commit_sha = payload.get("after")
            commits = payload.get("commits", [])

            # Update Branch head if ref matches a branch
            if ref.startswith("refs/heads/"):
                branch_name = ref.replace("refs/heads/", "")
                branch = db.scalar(
                    select(Branch).where(Branch.repository_id == repository.id, Branch.name == branch_name)
                )
                if branch and head_commit_sha and head_commit_sha != "0000000000000000000000000000000000000000":
                    branch.commit_sha = head_commit_sha
                    branch.updated_at = datetime.now(timezone.utc)
                elif not branch and head_commit_sha and head_commit_sha != "0000000000000000000000000000000000000000":
                    db.add(
                        Branch(
                            repository_id=repository.id,
                            name=branch_name,
                            commit_sha=head_commit_sha,
                            is_default=(branch_name == (repository.default_branch or "main")),
                            updated_at=datetime.now(timezone.utc),
                        )
                    )

            # Ingest new commits incrementally
            for c in commits:
                sha = c.get("id")
                if not sha:
                    continue
                author_data = c.get("author", {})
                committer_data = c.get("committer", {})
                msg = c.get("message", "")
                timestamp = _parse_time(c.get("timestamp")) or datetime.now(timezone.utc)

                existing_commit = db.scalar(
                    select(Commit).where(Commit.repository_id == repository.id, Commit.sha == sha)
                )
                if not existing_commit:
                    commit_obj = Commit(
                        repository_id=repository.id,
                        sha=sha,
                        author_login=author_data.get("username") or committer_data.get("username"),
                        author_name=author_data.get("name"),
                        author_email=author_data.get("email"),
                        committer_name=committer_data.get("name"),
                        committer_email=committer_data.get("email"),
                        message=msg,
                        committed_at=timestamp,
                        commit_url=c.get("url"),
                    )
                    db.add(commit_obj)
                    db.flush()

                    # Commit file changes
                    for file_path in c.get("added", []):
                        db.add(CommitFileChange(commit_id=commit_obj.id, repository_id=repository.id, file_path=file_path, status="added"))
                    for file_path in c.get("modified", []):
                        db.add(CommitFileChange(commit_id=commit_obj.id, repository_id=repository.id, file_path=file_path, status="modified"))
                    for file_path in c.get("removed", []):
                        db.add(CommitFileChange(commit_id=commit_obj.id, repository_id=repository.id, file_path=file_path, status="removed"))

            # Update sync cursor
            cursor = db.scalar(select(RepositorySyncCursor).where(RepositorySyncCursor.repository_id == repository.id))
            if cursor and head_commit_sha and head_commit_sha != "0000000000000000000000000000000000000000":
                cursor.last_commit_sha = head_commit_sha
                cursor.last_sync_at = datetime.now(timezone.utc)

        elif event == "pull_request":
            pr_data = payload.get("pull_request", {})
            pr_github_id = pr_data.get("id")
            if not pr_github_id:
                continue

            existing_pr = db.scalar(
                select(PullRequest).where(
                    PullRequest.repository_id == repository.id,
                    PullRequest.github_id == pr_github_id,
                )
            )

            state = pr_data.get("state", "open")
            if pr_data.get("merged"):
                state = "merged"

            values = {
                "number": pr_data.get("number"),
                "title": pr_data.get("title"),
                "body": pr_data.get("body"),
                "author_login": pr_data.get("user", {}).get("login"),
                "state": state,
                "created_at": _parse_time(pr_data.get("created_at")) or datetime.now(timezone.utc),
                "merged_at": _parse_time(pr_data.get("merged_at")),
                "closed_at": _parse_time(pr_data.get("closed_at")),
                "base_branch": pr_data.get("base", {}).get("ref"),
                "head_branch": pr_data.get("head", {}).get("ref"),
                "base_sha": pr_data.get("base", {}).get("sha"),
                "head_sha": pr_data.get("head", {}).get("sha"),
                "additions": pr_data.get("additions", 0),
                "deletions": pr_data.get("deletions", 0),
                "changed_files_count": pr_data.get("changed_files", 0),
                "merge_commit_sha": pr_data.get("merge_commit_sha"),
            }

            if existing_pr:
                for k, v in values.items():
                    setattr(existing_pr, k, v)
            else:
                db.add(PullRequest(repository_id=repository.id, github_id=pr_github_id, **values))

        elif event == "issues":
            issue_data = payload.get("issue", {})
            issue_github_id = issue_data.get("id")
            if not issue_github_id or "pull_request" in issue_data:
                continue

            existing_issue = db.scalar(
                select(Issue).where(
                    Issue.repository_id == repository.id,
                    Issue.github_id == issue_github_id,
                )
            )

            values = {
                "number": issue_data.get("number"),
                "title": issue_data.get("title"),
                "body": issue_data.get("body"),
                "author_login": issue_data.get("user", {}).get("login"),
                "state": issue_data.get("state", "open"),
                "created_at": _parse_time(issue_data.get("created_at")) or datetime.now(timezone.utc),
                "closed_at": _parse_time(issue_data.get("closed_at")),
                "updated_at": _parse_time(issue_data.get("updated_at")),
            }

            if existing_issue:
                for k, v in values.items():
                    setattr(existing_issue, k, v)
            else:
                db.add(Issue(repository_id=repository.id, github_id=issue_github_id, **values))

        elif event == "issue_comment":
            comment_data = payload.get("comment", {})
            issue_data = payload.get("issue", {})
            comment_id = comment_data.get("id")
            issue_github_id = issue_data.get("id")

            if comment_id and issue_github_id:
                issue_rec = db.scalar(
                    select(Issue).where(
                        Issue.repository_id == repository.id,
                        Issue.github_id == issue_github_id,
                    )
                )
                if issue_rec:
                    existing_comment = db.scalar(
                        select(IssueComment).where(
                            IssueComment.issue_id == issue_rec.id,
                            IssueComment.github_id == comment_id,
                        )
                    )
                    if not existing_comment:
                        db.add(
                            IssueComment(
                                issue_id=issue_rec.id,
                                github_id=comment_id,
                                author_login=comment_data.get("user", {}).get("login"),
                                body=comment_data.get("body", ""),
                                created_at=_parse_time(comment_data.get("created_at")) or datetime.now(timezone.utc),
                            )
                        )

        elif event == "pull_request_review":
            review_data = payload.get("review", {})
            pr_data = payload.get("pull_request", {})
            review_id = review_data.get("id")
            pr_github_id = pr_data.get("id")

            if review_id and pr_github_id:
                pr_rec = db.scalar(
                    select(PullRequest).where(
                        PullRequest.repository_id == repository.id,
                        PullRequest.github_id == pr_github_id,
                    )
                )
                if pr_rec:
                    existing_review = db.scalar(
                        select(Review).where(
                            Review.pull_request_id == pr_rec.id,
                            Review.github_id == review_id,
                        )
                    )
                    if existing_review:
                        existing_review.state = review_data.get("state", "COMMENTED")
                        existing_review.body = review_data.get("body")
                    else:
                        db.add(
                            Review(
                                pull_request_id=pr_rec.id,
                                github_id=review_id,
                                reviewer_login=review_data.get("user", {}).get("login"),
                                state=review_data.get("state", "COMMENTED"),
                                submitted_at=_parse_time(review_data.get("submitted_at")),
                                body=review_data.get("body"),
                                commit_sha=review_data.get("commit_id"),
                            )
                        )

    db.commit()


@router.post("/github", response_model=WebhookIngestOut, status_code=status.HTTP_202_ACCEPTED)
async def github_webhook_receiver(
    request: Request,
    x_github_event: str = Header(..., alias="X-GitHub-Event"),
    x_github_delivery: str = Header(..., alias="X-GitHub-Delivery"),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
    db: Session = Depends(get_db),
):
    """Secure, idempotent GitHub webhook receiver."""
    settings = get_settings()
    body_bytes = await request.body()

    # 1. HMAC Verification
    if not verify_github_signature(body_bytes, x_hub_signature_256, settings.github_webhook_secret):
        logger.warning(f"Invalid webhook signature for delivery {x_github_delivery}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    # 2. Idempotency Check
    existing_delivery = db.scalar(
        select(WebhookDelivery).where(WebhookDelivery.delivery_id == x_github_delivery)
    )
    if existing_delivery:
        logger.info(f"Duplicate webhook delivery received: {x_github_delivery}. Skipping.")
        return WebhookIngestOut(
            status="duplicate_skipped",
            event=x_github_event,
            delivery_id=x_github_delivery,
        )

    # 3. Parse JSON
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception as exc:
        logger.error(f"Failed to parse webhook JSON for delivery {x_github_delivery}: {exc}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    payload_hash = hashlib.sha256(body_bytes).hexdigest()
    repo_data = payload.get("repository", {})
    github_repo_id = repo_data.get("id")

    matched_repo_id = None
    if github_repo_id:
        repo_rec = db.scalar(select(Repository.id).where(Repository.github_id == github_repo_id))
        matched_repo_id = repo_rec

    # 4. Record Delivery
    delivery = WebhookDelivery(
        delivery_id=x_github_delivery,
        event=x_github_event,
        repository_id=matched_repo_id,
        payload_hash=payload_hash,
        status="received",
    )
    db.add(delivery)
    db.commit()

    # 5. Process Event
    try:
        process_webhook_payload(db, x_github_event, payload, x_github_delivery)
        delivery.status = "processed"
        delivery.processed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        logger.error(f"Error processing webhook {x_github_event}:{x_github_delivery}: {exc}")
        delivery.status = "failed"
        delivery.error = str(exc)
        db.commit()

    return WebhookIngestOut(
        status="processed" if delivery.status == "processed" else "received",
        event=x_github_event,
        delivery_id=x_github_delivery,
        action=payload.get("action"),
    )
