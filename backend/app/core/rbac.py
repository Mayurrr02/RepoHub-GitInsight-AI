from enum import IntEnum
from fastapi import Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models.models import Organization, OrganizationMember, OrgRole, User


class RoleLevel(IntEnum):
    viewer = 1
    member = 2
    admin = 3
    owner = 4


def get_role_level(role_name: str) -> int:
    try:
        return RoleLevel[role_name.lower()].value
    except KeyError:
        return 0


def get_user_org_membership(db: Session, org_id: int, user_id: int) -> tuple[Organization, OrganizationMember | None, str | None]:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    
    if org.owner_id == user_id:
        # Organization owner has implicit 'owner' role
        return org, None, OrgRole.OWNER.value

    member = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id
        )
    )
    if not member:
        return org, None, None

    return org, member, member.role


def require_org_role(min_role: str = OrgRole.VIEWER.value):
    """
    Dependency factory to enforce minimum role permission in an organization.
    Expects {org_id} or {id} in path parameters.
    """
    def dependency(
        org_id: int = Path(..., alias="id"),
        user: User = Depends(current_user),
        db: Session = Depends(get_db)
    ) -> tuple[Organization, str]:
        org, member, role = get_user_org_membership(db, org_id, user.id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization"
            )
        
        required_level = get_role_level(min_role)
        user_level = get_role_level(role)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: Requires '{min_role}' role or higher (you have '{role}')"
            )
        return org, role

    return dependency
