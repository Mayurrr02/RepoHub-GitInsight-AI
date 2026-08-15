from collections import defaultdict
from datetime import datetime, timedelta, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.models import (
    Commit,
    Contributor,
    Issue,
    Organization,
    OrganizationMember,
    OrganizationRepository,
    PullRequest,
    Repository,
    RepositoryMetric,
    Review,
    User,
)


def _ensure_tz(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _get_org_repo_ids(db: Session, org_id: int) -> list[int]:
    """Retrieve all repository IDs associated with an organization."""
    repo_ids = db.scalars(
        select(OrganizationRepository.repository_id).where(
            OrganizationRepository.organization_id == org_id
        )
    ).all()
    
    if not repo_ids:
        # Fallback: All repositories owned by organization members
        member_user_ids = db.scalars(
            select(OrganizationMember.user_id).where(
                OrganizationMember.organization_id == org_id
            )
        ).all()
        if member_user_ids:
            repo_ids = db.scalars(
                select(Repository.id).where(Repository.user_id.in_(member_user_ids))
            ).all()

    return list(repo_ids)


def calculate_contributor_rankings(db: Session, org_id: int) -> list[dict]:
    repo_ids = _get_org_repo_ids(db, org_id)
    if not repo_ids:
        return []

    users = {u.login: u for u in db.scalars(select(User)).all()}

    commit_counts = defaultdict(int)
    commit_rows = db.execute(
        select(Commit.author_login, func.count(Commit.id))
        .where(Commit.repository_id.in_(repo_ids), Commit.author_login.isnot(None))
        .group_by(Commit.author_login)
    ).all()
    for login, cnt in commit_rows:
        if login:
            commit_counts[login] += cnt

    pr_counts = defaultdict(int)
    pr_rows = db.execute(
        select(PullRequest.author_login, func.count(PullRequest.id))
        .where(PullRequest.repository_id.in_(repo_ids), PullRequest.author_login.isnot(None))
        .group_by(PullRequest.author_login)
    ).all()
    for login, cnt in pr_rows:
        if login:
            pr_counts[login] += cnt

    review_counts = defaultdict(int)
    review_rows = db.execute(
        select(Review.reviewer_login, func.count(Review.id))
        .join(PullRequest)
        .where(PullRequest.repository_id.in_(repo_ids), Review.reviewer_login.isnot(None))
        .group_by(Review.reviewer_login)
    ).all()
    for login, cnt in review_rows:
        if login:
            review_counts[login] += cnt

    all_logins = set(commit_counts.keys()) | set(pr_counts.keys()) | set(review_counts.keys())
    if not all_logins:
        for c in db.scalars(select(Contributor).where(Contributor.repository_id.in_(repo_ids))).all():
            all_logins.add(c.login)
            commit_counts[c.login] = max(commit_counts[c.login], c.contributions)

    items = []
    for login in all_logins:
        c_count = commit_counts.get(login, 0)
        pr_count = pr_counts.get(login, 0)
        r_count = review_counts.get(login, 0)
        impact = round(c_count * 2.0 + pr_count * 5.0 + r_count * 3.5, 1)

        u = users.get(login)
        items.append({
            "login": login,
            "name": u.name if u else None,
            "avatar_url": u.avatar_url if u else f"https://github.com/{login}.png",
            "commits": c_count,
            "pull_requests": pr_count,
            "reviews": r_count,
            "impact_score": impact,
        })

    items.sort(key=lambda x: (x["impact_score"], x["commits"]), reverse=True)

    for idx, item in enumerate(items, start=1):
        item["rank"] = idx

    return items


def calculate_team_productivity(db: Session, org_id: int, weeks: int = 12) -> dict:
    repo_ids = _get_org_repo_ids(db, org_id)
    if not repo_ids:
        return {
            "organization_id": org_id,
            "total_commits": 0,
            "total_pull_requests_merged": 0,
            "average_weekly_commits": 0.0,
            "sprint_velocity": 0.0,
            "periods": []
        }

    now = datetime.now(timezone.utc)
    since = now - timedelta(weeks=weeks)

    commits = db.scalars(
        select(Commit).where(
            Commit.repository_id.in_(repo_ids),
            Commit.committed_at >= since
        )
    ).all()

    merged_prs = db.scalars(
        select(PullRequest).where(
            PullRequest.repository_id.in_(repo_ids),
            PullRequest.merged_at >= since
        )
    ).all()

    # Bucket into weekly periods
    weekly_buckets: dict[str, dict] = {}
    for i in range(weeks - 1, -1, -1):
        w_start = (now - timedelta(weeks=i + 1)).strftime("%b %d")
        w_end = (now - timedelta(weeks=i)).strftime("%b %d")
        key = f"{w_start} - {w_end}"
        weekly_buckets[key] = {
            "period": key,
            "commits": 0,
            "pull_requests_merged": 0,
            "contributors": set(),
            "velocity_score": 0.0,
            "start_time": now - timedelta(weeks=i + 1),
            "end_time": now - timedelta(weeks=i)
        }

    for c in commits:
        c_time = _ensure_tz(c.committed_at)
        if c_time:
            for b_key, b_data in weekly_buckets.items():
                if b_data["start_time"] <= c_time < b_data["end_time"]:
                    b_data["commits"] += 1
                    if c.author_login:
                        b_data["contributors"].add(c.author_login)
                    break

    for pr in merged_prs:
        pr_merged_time = _ensure_tz(pr.merged_at)
        if pr_merged_time:
            for b_key, b_data in weekly_buckets.items():
                if b_data["start_time"] <= pr_merged_time < b_data["end_time"]:
                    b_data["pull_requests_merged"] += 1
                    break

    periods = []
    total_velocity = 0.0
    for b_data in weekly_buckets.values():
        active_cnt = len(b_data["contributors"])
        c_cnt = b_data["commits"]
        pr_cnt = b_data["pull_requests_merged"]
        vel = round(c_cnt * 1.5 + pr_cnt * 4.0 + active_cnt * 3.0, 1)
        total_velocity += vel
        periods.append({
            "period": b_data["period"],
            "commits": c_cnt,
            "pull_requests_merged": pr_cnt,
            "active_contributors": active_cnt,
            "velocity_score": vel,
        })

    total_commits = len(commits)
    total_prs = len(merged_prs)
    avg_weekly = round(total_commits / max(1, weeks), 1)
    sprint_velocity = round(total_velocity / max(1, weeks), 1)

    return {
        "organization_id": org_id,
        "total_commits": total_commits,
        "total_pull_requests_merged": total_prs,
        "average_weekly_commits": avg_weekly,
        "sprint_velocity": sprint_velocity,
        "periods": periods
    }


def calculate_review_bottlenecks(db: Session, org_id: int) -> dict:
    repo_ids = _get_org_repo_ids(db, org_id)
    if not repo_ids:
        return {
            "organization_id": org_id,
            "average_review_time_hours": 0.0,
            "average_merge_time_hours": 0.0,
            "unreviewed_pr_count": 0,
            "total_open_prs": 0,
            "unreviewed_prs": [],
            "reviewer_workload": []
        }

    now = datetime.now(timezone.utc)
    prs = db.scalars(
        select(PullRequest).where(PullRequest.repository_id.in_(repo_ids))
    ).all()
    repos = {r.id: r for r in db.scalars(select(Repository).where(Repository.id.in_(repo_ids))).all()}

    open_prs = [pr for pr in prs if pr.state == "open" or pr.closed_at is None]
    merged_prs = [pr for pr in prs if pr.merged_at is not None]

    merge_durations = []
    for pr in merged_prs:
        pr_created = _ensure_tz(pr.created_at)
        pr_merged = _ensure_tz(pr.merged_at)
        if pr_created and pr_merged and pr_merged >= pr_created:
            merge_durations.append((pr_merged - pr_created).total_seconds() / 3600.0)

    avg_merge_time = round(sum(merge_durations) / len(merge_durations), 1) if merge_durations else 0.0

    reviews = db.scalars(
        select(Review).join(PullRequest).where(PullRequest.repository_id.in_(repo_ids))
    ).all()

    pr_first_review: dict[int, datetime] = {}
    reviewer_counts = defaultdict(int)
    for rev in reviews:
        rev_sub = _ensure_tz(rev.submitted_at)
        if rev_sub:
            if rev.pull_request_id not in pr_first_review or rev_sub < pr_first_review[rev.pull_request_id]:
                pr_first_review[rev.pull_request_id] = rev_sub
        if rev.reviewer_login:
            reviewer_counts[rev.reviewer_login] += 1

    review_durations = []
    for pr in prs:
        if pr.id in pr_first_review:
            first_review_at = pr_first_review[pr.id]
            pr_created = _ensure_tz(pr.created_at)
            if pr_created and first_review_at >= pr_created:
                review_durations.append((first_review_at - pr_created).total_seconds() / 3600.0)

    avg_review_time = round(sum(review_durations) / len(review_durations), 1) if review_durations else 0.0

    unreviewed_prs = []
    for pr in open_prs:
        if pr.id not in pr_first_review:
            pr_created = _ensure_tz(pr.created_at)
            waiting = round((now - pr_created).total_seconds() / 3600.0, 1) if pr_created else 0.0
            repo = repos.get(pr.repository_id)
            unreviewed_prs.append({
                "id": pr.id,
                "repository_name": repo.full_name if repo else f"Repo #{pr.repository_id}",
                "number": pr.number,
                "author_login": pr.author_login,
                "state": pr.state,
                "created_at": pr.created_at,
                "waiting_hours": max(0.0, waiting),
            })

    unreviewed_prs.sort(key=lambda x: x["waiting_hours"], reverse=True)

    reviewer_workload = [
        {"login": login, "reviews_completed": count}
        for login, count in sorted(reviewer_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "organization_id": org_id,
        "average_review_time_hours": avg_review_time,
        "average_merge_time_hours": avg_merge_time,
        "unreviewed_pr_count": len(unreviewed_prs),
        "total_open_prs": len(open_prs),
        "unreviewed_prs": unreviewed_prs[:20],
        "reviewer_workload": reviewer_workload[:10]
    }


def calculate_team_summary(db: Session, org: Organization) -> dict:
    repo_ids = _get_org_repo_ids(db, org.id)
    members_count = db.scalar(
        select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org.id)
    ) or 0

    if not repo_ids:
        return {
            "organization_id": org.id,
            "name": org.name,
            "slug": org.slug,
            "repositories_count": 0,
            "members_count": members_count,
            "health_score": 0.0,
            "activity_score": 0.0,
            "merge_rate": 0.0,
            "issue_resolution_rate": 0.0
        }

    metrics = db.scalars(
        select(RepositoryMetric).where(RepositoryMetric.repository_id.in_(repo_ids))
    ).all()

    if metrics:
        avg_health = sum(m.health_score for m in metrics) / len(metrics)
        avg_activity = sum(m.activity_score for m in metrics) / len(metrics)
        avg_merge = sum(m.merge_rate for m in metrics) / len(metrics)
        avg_issue = sum(m.issue_resolution_rate for m in metrics) / len(metrics)
    else:
        avg_health = avg_activity = avg_merge = avg_issue = 0.0

    return {
        "organization_id": org.id,
        "name": org.name,
        "slug": org.slug,
        "repositories_count": len(repo_ids),
        "members_count": members_count,
        "health_score": round(avg_health, 1),
        "activity_score": round(avg_activity, 1),
        "merge_rate": round(avg_merge, 1),
        "issue_resolution_rate": round(avg_issue, 1)
    }
