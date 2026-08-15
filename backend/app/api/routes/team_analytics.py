from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.rbac import require_org_role
from app.db.session import get_db
from app.models.models import Organization, OrgRole
from app.schemas.schemas import (
    ContributorRankingsResponse,
    ReviewBottlenecksResponse,
    TeamProductivityResponse,
    TeamSummaryResponse,
)
from app.services.team_analytics import (
    calculate_contributor_rankings,
    calculate_review_bottlenecks,
    calculate_team_productivity,
    calculate_team_summary,
)

router = APIRouter(prefix="/organizations/{id}/analytics", tags=["Team Analytics"])


@router.get("/overview", response_model=TeamSummaryResponse)
def get_team_overview(
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    return calculate_team_summary(db, org)


@router.get("/rankings", response_model=ContributorRankingsResponse)
def get_rankings(
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    rankings = calculate_contributor_rankings(db, org.id)
    return {
        "organization_id": org.id,
        "total_contributors": len(rankings),
        "rankings": rankings
    }


@router.get("/productivity", response_model=TeamProductivityResponse)
def get_productivity(
    weeks: int = Query(default=12, ge=1, le=52),
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    return calculate_team_productivity(db, org.id, weeks=weeks)


@router.get("/bottlenecks", response_model=ReviewBottlenecksResponse)
def get_bottlenecks(
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    return calculate_review_bottlenecks(db, org.id)
