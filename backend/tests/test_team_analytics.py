from datetime import datetime, timedelta, timezone
from app.core.security import create_access_token
from app.models.models import (
    Commit,
    Organization,
    OrganizationMember,
    OrganizationRepository,
    PullRequest,
    Repository,
    RepositoryMetric,
    Review,
    User,
)


def test_team_analytics_endpoints(client, db):
    # 1. Setup Org, User, Repo, Commits, PRs, Reviews
    user = User(github_id=2001, login="devlead", name="Dev Lead")
    contributor1 = User(github_id=2002, login="frontend_ninja", name="Ninja")
    contributor2 = User(github_id=2003, login="backend_pro", name="Pro")
    db.add_all([user, contributor1, contributor2])
    db.commit()

    org = Organization(name="FinTech Hub", slug="fintech-hub", owner_id=user.id)
    db.add(org)
    db.commit()

    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role="owner"))
    db.commit()

    repo = Repository(
        user_id=user.id,
        github_id=3001,
        name="payment-api",
        full_name="fintech/payment-api",
        html_url="https://github.com/fintech/payment-api",
        description="Payment API engine",
        is_private=False,
        language="Python",
        stars=10
    )
    db.add(repo)
    db.commit()

    db.add(OrganizationRepository(organization_id=org.id, repository_id=repo.id))
    db.commit()

    now = datetime.now(timezone.utc)
    # Add Commits
    for i in range(5):
        db.add(Commit(
            repository_id=repo.id,
            sha=f"c1_{i}",
            author_login="frontend_ninja",
            message=f"feat: frontend work {i}",
            committed_at=now - timedelta(days=i)
        ))
    for i in range(10):
        db.add(Commit(
            repository_id=repo.id,
            sha=f"c2_{i}",
            author_login="backend_pro",
            message=f"feat: backend work {i}",
            committed_at=now - timedelta(days=i)
        ))

    # Add PRs
    pr1 = PullRequest(
        repository_id=repo.id,
        github_id=401,
        number=1,
        author_login="frontend_ninja",
        state="closed",
        created_at=now - timedelta(days=4),
        merged_at=now - timedelta(days=3),
        closed_at=now - timedelta(days=3)
    )
    pr2 = PullRequest(
        repository_id=repo.id,
        github_id=402,
        number=2,
        author_login="backend_pro",
        state="open",
        created_at=now - timedelta(hours=36),
        merged_at=None,
        closed_at=None
    )
    db.add_all([pr1, pr2])
    db.commit()

    # Add Review for PR1
    db.add(Review(
        pull_request_id=pr1.id,
        github_id=501,
        reviewer_login="devlead",
        state="APPROVED",
        submitted_at=now - timedelta(days=3, hours=12)
    ))

    # Add Repo Metric
    db.add(RepositoryMetric(
        repository_id=repo.id,
        merge_rate=85.0,
        issue_resolution_rate=90.0,
        health_score=92.5,
        activity_score=88.0,
        documentation_score=95.0,
        maintenance_score=90.0
    ))
    db.commit()

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Test 1: Team Overview
    overview_resp = client.get(f"/api/v1/organizations/{org.id}/analytics/overview", headers=headers)
    assert overview_resp.status_code == 200
    ov_data = overview_resp.json()
    assert ov_data["health_score"] == 92.5
    assert ov_data["repositories_count"] == 1

    # Test 2: Contributor Rankings
    rankings_resp = client.get(f"/api/v1/organizations/{org.id}/analytics/rankings", headers=headers)
    assert rankings_resp.status_code == 200
    rank_data = rankings_resp.json()
    assert rank_data["total_contributors"] >= 2
    top = rank_data["rankings"][0]
    assert top["rank"] == 1
    assert top["login"] in ("backend_pro", "frontend_ninja")
    assert top["impact_score"] > 0

    # Test 3: Team Productivity
    prod_resp = client.get(f"/api/v1/organizations/{org.id}/analytics/productivity?weeks=4", headers=headers)
    assert prod_resp.status_code == 200
    prod_data = prod_resp.json()
    assert prod_data["total_commits"] == 15
    assert prod_data["total_pull_requests_merged"] == 1
    assert len(prod_data["periods"]) == 4

    # Test 4: Review Bottlenecks
    bottle_resp = client.get(f"/api/v1/organizations/{org.id}/analytics/bottlenecks", headers=headers)
    assert bottle_resp.status_code == 200
    b_data = bottle_resp.json()
    assert b_data["unreviewed_pr_count"] == 1
    assert len(b_data["unreviewed_prs"]) == 1
    assert b_data["unreviewed_prs"][0]["number"] == 2
    assert b_data["unreviewed_prs"][0]["waiting_hours"] >= 30
