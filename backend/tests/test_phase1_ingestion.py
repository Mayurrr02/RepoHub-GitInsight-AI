from datetime import datetime, timezone
from app.core.security import create_access_token
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
    Review,
    ReviewComment,
    User,
)
from app.services.github import persist_repository_data


def test_persist_repository_data_comprehensive(db):
    user = User(github_id=50, login="octo-tester", name="Tester", avatar_url=None)
    db.add(user)
    db.flush()

    repo = Repository(
        user_id=user.id,
        github_id=5001,
        name="ai-engine",
        full_name="octo-tester/ai-engine",
        html_url="https://github.com/octo-tester/ai-engine",
        default_branch="main",
    )
    db.add(repo)
    db.flush()

    now_iso = datetime.now(timezone.utc).isoformat()

    mock_data = {
        "metadata": {
            "default_branch": "main",
            "description": "Enterprise AI intelligence engine",
            "stargazers_count": 99,
        },
        "branches": [
            {"name": "main", "commit": {"sha": "sha-main-1"}, "protected": True},
            {"name": "feature/ai", "commit": {"sha": "sha-feat-1"}, "protected": False},
        ],
        "commits": [
            {
                "sha": "sha-main-1",
                "commit": {
                    "author": {"name": "Mayur", "email": "mayur@example.com", "date": now_iso},
                    "message": "feat: intelligence pipeline\n\nFull details here",
                },
                "author": {"login": "octo-tester"},
                "parents": [{"sha": "sha-parent-0"}],
                "html_url": "https://github.com/octo-tester/ai-engine/commit/sha-main-1",
            }
        ],
        "commit_details": [
            {
                "sha": "sha-main-1",
                "stats": {"additions": 45, "deletions": 5, "total": 50},
                "files": [
                    {
                        "filename": "backend/app/main.py",
                        "status": "modified",
                        "additions": 40,
                        "deletions": 2,
                        "changes": 42,
                        "patch": "@@ -1,3 +1,45 @@\n+import asyncio",
                        "sha": "blob-sha-1",
                    }
                ],
            }
        ],
        "pulls": [
            {
                "id": 8801,
                "number": 1,
                "title": "Add AI Assistant",
                "body": "Implements repository assistant",
                "state": "open",
                "created_at": now_iso,
                "user": {"login": "octo-tester"},
                "base": {"ref": "main", "sha": "sha-parent-0"},
                "head": {"ref": "feature/ai", "sha": "sha-main-1"},
                "labels": [{"name": "enhancement"}, {"name": "ai"}],
            }
        ],
        "pr_files": [
            [
                {
                    "filename": "backend/app/main.py",
                    "status": "modified",
                    "additions": 40,
                    "deletions": 2,
                    "patch": "diff patch content",
                }
            ]
        ],
        "reviews": [
            [
                {
                    "id": 9901,
                    "user": {"login": "senior-reviewer"},
                    "state": "APPROVED",
                    "body": "LGTM!",
                    "submitted_at": now_iso,
                    "commit_id": "sha-main-1",
                }
            ]
        ],
        "review_comments": [
            [
                {
                    "id": 9902,
                    "path": "backend/app/main.py",
                    "line": 42,
                    "commit_id": "sha-main-1",
                    "body": "Consider using connection pooling",
                    "user": {"login": "senior-reviewer"},
                    "created_at": now_iso,
                }
            ]
        ],
        "issues": [
            {
                "id": 7701,
                "number": 10,
                "title": "Bug in chunking",
                "body": "File parser error on empty files",
                "user": {"login": "bug-reporter"},
                "state": "open",
                "created_at": now_iso,
                "labels": [{"name": "bug"}],
            }
        ],
        "issue_comments": [
            [
                {
                    "id": 7702,
                    "user": {"login": "maintainer"},
                    "body": "Fix is on main branch",
                    "created_at": now_iso,
                }
            ]
        ],
        "releases": [
            {"id": 6601, "name": "v1.0.0", "published_at": now_iso}
        ],
        "contributors": [
            {"id": 5501, "login": "octo-tester", "contributions": 120}
        ],
        "languages": {"Python": 85000, "TypeScript": 15000},
    }

    persist_repository_data(db, repo, mock_data)

    # Assertions
    assert repo.stars == 99
    assert repo.description == "Enterprise AI intelligence engine"

    # Branches
    branches = db.scalars(db.query(Branch).filter(Branch.repository_id == repo.id).statement).all()
    assert len(branches) == 2
    main_b = [b for b in branches if b.name == "main"][0]
    assert main_b.is_default is True
    assert main_b.is_protected is True

    # Commits & File changes
    commits = db.scalars(db.query(Commit).filter(Commit.repository_id == repo.id).statement).all()
    assert len(commits) == 1
    c = commits[0]
    assert c.sha == "sha-main-1"
    assert c.author_name == "Mayur"
    assert c.author_email == "mayur@example.com"
    assert c.additions == 45
    assert c.deletions == 5
    assert c.files_changed_count == 1
    assert "sha-parent-0" in c.parent_shas

    file_changes = db.scalars(db.query(CommitFileChange).filter(CommitFileChange.commit_id == c.id).statement).all()
    assert len(file_changes) == 1
    assert file_changes[0].file_path == "backend/app/main.py"
    assert file_changes[0].status == "modified"

    # Pull Request & Review
    prs = db.scalars(db.query(PullRequest).filter(PullRequest.repository_id == repo.id).statement).all()
    assert len(prs) == 1
    pr = prs[0]
    assert pr.title == "Add AI Assistant"
    assert pr.base_branch == "main"
    assert "ai" in pr.labels

    pr_files = db.scalars(db.query(PullRequestFile).filter(PullRequestFile.pull_request_id == pr.id).statement).all()
    assert len(pr_files) == 1
    assert pr_files[0].file_path == "backend/app/main.py"

    reviews = db.scalars(db.query(Review).filter(Review.pull_request_id == pr.id).statement).all()
    assert len(reviews) == 1
    assert reviews[0].state == "APPROVED"
    assert reviews[0].body == "LGTM!"

    rev_comments = db.scalars(db.query(ReviewComment).filter(ReviewComment.pull_request_id == pr.id).statement).all()
    assert len(rev_comments) == 1
    assert rev_comments[0].line == 42
    assert "connection pooling" in rev_comments[0].body

    # Issues & Comments
    issues = db.scalars(db.query(Issue).filter(Issue.repository_id == repo.id).statement).all()
    assert len(issues) == 1
    assert issues[0].number == 10
    assert issues[0].title == "Bug in chunking"

    issue_comments = db.scalars(db.query(IssueComment).filter(IssueComment.issue_id == issues[0].id).statement).all()
    assert len(issue_comments) == 1
    assert "Fix is on main branch" in issue_comments[0].body
