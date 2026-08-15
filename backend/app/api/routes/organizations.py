from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.core.rbac import require_org_role
from app.core.rate_limit import rate_limit
from app.db.session import get_db
from app.models.models import Organization, OrganizationMember, OrganizationRepository, OrgRole, Repository, User
from app.schemas.schemas import (
    OrganizationCreate,
    OrganizationMemberAdd,
    OrganizationMemberOut,
    OrganizationMemberRoleUpdate,
    OrganizationOut,
    OrganizationRepositoryOut,
    OrganizationUpdate,
)
from app.services.organization import (
    add_organization_member,
    add_organization_repository,
    create_organization,
    delete_organization,
    get_organization_detail,
    list_user_organizations,
    remove_organization_member,
    remove_organization_repository,
    update_member_role,
    update_organization,
)

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit(max_requests=20, window_seconds=60))])
def create_org(
    body: OrganizationCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else None
    org = create_organization(db, user, body, ip_address=ip)
    return get_organization_detail(db, org, user.id)


@router.get("", response_model=list[OrganizationOut])
def list_orgs(
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    return list_user_organizations(db, user.id)


@router.get("/{id}", response_model=OrganizationOut)
def get_org(
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    return get_organization_detail(db, org, user.id)


@router.put("/{id}", response_model=OrganizationOut)
def update_org(
    body: OrganizationUpdate,
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.ADMIN.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    ip = request.client.host if request.client else None
    updated = update_organization(db, org, body, user_id=user.id, ip_address=ip)
    return get_organization_detail(db, updated, user.id)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_org(
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.OWNER.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    ip = request.client.host if request.client else None
    delete_organization(db, org, user_id=user.id, ip_address=ip)
    return None


@router.get("/{id}/members", response_model=list[OrganizationMemberOut])
def list_members(
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    return db.scalars(
        select(OrganizationMember).where(OrganizationMember.organization_id == org.id)
    ).all()


@router.post("/{id}/members", response_model=OrganizationMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    body: OrganizationMemberAdd,
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.ADMIN.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    target_user = None
    if body.user_id:
        target_user = db.get(User, body.user_id)
    elif body.login:
        target_user = db.scalar(select(User).where(User.login == body.login))

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Users must sign in to RepoHub once before joining an organization."
        )

    ip = request.client.host if request.client else None
    member = add_organization_member(db, org, target_user, body.role, user_id=user.id, ip_address=ip)
    return member


@router.put("/{id}/members/{user_id}", response_model=OrganizationMemberOut)
def update_member(
    user_id: int,
    body: OrganizationMemberRoleUpdate,
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.ADMIN.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    ip = request.client.host if request.client else None
    return update_member_role(db, org, user_id, body.role, user_id=user.id, ip_address=ip)


@router.delete("/{id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: int,
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.ADMIN.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    ip = request.client.host if request.client else None
    remove_organization_member(db, org, user_id, user_id=user.id, ip_address=ip)
    return None


@router.get("/{id}/repositories", response_model=list[OrganizationRepositoryOut])
def list_repositories(
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.VIEWER.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    return db.scalars(
        select(OrganizationRepository).where(OrganizationRepository.organization_id == org.id)
    ).all()


@router.post("/{id}/repositories/{repo_id}", response_model=OrganizationRepositoryOut, status_code=status.HTTP_201_CREATED)
def link_repository(
    repo_id: int,
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.MEMBER.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    repo = db.get(Repository, repo_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    ip = request.client.host if request.client else None
    return add_organization_repository(db, org, repo, user_id=user.id, ip_address=ip)


@router.delete("/{id}/repositories/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_repository(
    repo_id: int,
    request: Request,
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.ADMIN.value)),
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    ip = request.client.host if request.client else None
    remove_organization_repository(db, org, repo_id, user_id=user.id, ip_address=ip)
    return None
