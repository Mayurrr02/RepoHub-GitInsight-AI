from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import ApiKey, Commit, Organization, OrganizationMember, Repository, User
from app.schemas.schemas import (
    ApiKeyCreatedOut,
    ApiKeyCreateIn,
    ApiKeyOut,
    GitHubAccountOut,
    UserOut,
    UserProfileOut,
    UserStatsOut,
)
from app.services.analytics import calculate_developer_metrics

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.get("/me/profile", response_model=UserProfileOut)
def me_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Calculate repository counts
    repos = db.scalars(select(Repository).where(Repository.user_id == user.id)).all()
    total_repos = len(repos)
    public_repos = sum(1 for r in repos if not r.is_private)
    private_repos = sum(1 for r in repos if r.is_private)

    # Calculate total commits tracked
    total_commits = db.scalar(
        select(func.count(Commit.id))
        .join(Repository, Commit.repository_id == Repository.id)
        .where(Repository.user_id == user.id)
    ) or 0

    # Calculate connected organizations
    member_org_ids = set(
        db.scalars(
            select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user.id)
        ).all()
    )
    owned_org_ids = set(
        db.scalars(
            select(Organization.id).where(Organization.owner_id == user.id)
        ).all()
    )
    total_orgs = len(member_org_ids.union(owned_org_ids))

    # Compute streak and review score
    dev_metric = calculate_developer_metrics(db, user.id)

    # GitHub account details & scopes
    gh_account = user.github_account
    raw_scope = gh_account.scope if gh_account else None
    scopes_list = []
    if raw_scope:
        # Scope may be space or comma separated
        delimiter = "," if "," in raw_scope else " "
        scopes_list = [s.strip() for s in raw_scope.split(delimiter) if s.strip()]

    return UserProfileOut(
        id=user.id,
        login=user.login,
        name=user.name,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        stats=UserStatsOut(
            total_repositories=total_repos,
            public_repositories=public_repos,
            private_repositories=private_repos,
            total_commits=total_commits,
            total_organizations=total_orgs,
            coding_streak=dev_metric.coding_streak,
            review_score=dev_metric.review_score,
        ),
        github_account=GitHubAccountOut(
            connected=gh_account is not None,
            github_id=user.github_id,
            scope=raw_scope,
            scopes_list=scopes_list,
        ),
    )


@router.get("/me/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(user: User = Depends(current_user), db: Session = Depends(get_db)):
    keys = db.scalars(
        select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
    ).all()
    return keys


@router.post("/me/api-keys", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
def create_api_key(
    body: ApiKeyCreateIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not body.name or not body.name.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="API Key name cannot be empty.",
        )

    # Generate secure random raw token
    random_hex = secrets.token_hex(20)
    raw_key = f"rh_live_{random_hex}"
    prefix = f"rh_live_{random_hex[:6]}..."
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    expires_at = None
    if body.expires_in_days and body.expires_in_days > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    api_key = ApiKey(
        user_id=user.id,
        name=body.name.strip(),
        key_hash=key_hash,
        prefix=prefix,
        expires_at=expires_at,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreatedOut(
        id=api_key.id,
        name=api_key.name,
        prefix=api_key.prefix,
        raw_key=raw_key,
        created_at=api_key.created_at,
        expires_at=api_key.expires_at,
    )


@router.delete("/me/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    key_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    key = db.scalar(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user.id)
    )
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found or does not belong to the user.",
        )
    db.delete(key)
    db.commit()
    return None

