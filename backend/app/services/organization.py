from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.models import Organization, OrganizationMember, OrganizationRepository, OrgRole, Repository, User
from app.schemas.schemas import OrganizationCreate, OrganizationUpdate
from app.services.audit import record_audit_log


def create_organization(db: Session, user: User, data: OrganizationCreate, ip_address: str | None = None) -> Organization:
    existing = db.scalar(select(Organization).where(Organization.slug == data.slug))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Organization with slug '{data.slug}' already exists."
        )

    org = Organization(
        name=data.name,
        slug=data.slug,
        avatar_url=data.avatar_url,
        owner_id=user.id,
    )
    db.add(org)
    db.flush()

    # Add owner as organization member
    member = OrganizationMember(
        organization_id=org.id,
        user_id=user.id,
        role=OrgRole.OWNER.value
    )
    db.add(member)
    db.commit()
    db.refresh(org)

    record_audit_log(
        db=db,
        action="org.create",
        resource_type="organization",
        user_id=user.id,
        org_id=org.id,
        resource_id=str(org.id),
        details={"name": org.name, "slug": org.slug},
        ip_address=ip_address
    )
    return org


def list_user_organizations(db: Session, user_id: int) -> list[dict]:
    # Query organizations where user is a member or owner
    memberships = db.scalars(
        select(OrganizationMember).where(OrganizationMember.user_id == user_id)
    ).all()
    
    org_ids = [m.organization_id for m in memberships]
    # Also include orgs where user is owner
    owned_orgs = db.scalars(select(Organization).where(Organization.owner_id == user_id)).all()
    all_org_ids = set(org_ids) | {o.id for o in owned_orgs}

    role_map = {m.organization_id: m.role for m in memberships}

    results = []
    for org_id in all_org_ids:
        org = db.get(Organization, org_id)
        if not org:
            continue
        members_count = db.scalar(
            select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org.id)
        ) or 0
        repos_count = db.scalar(
            select(func.count(OrganizationRepository.id)).where(OrganizationRepository.organization_id == org.id)
        ) or 0
        role = OrgRole.OWNER.value if org.owner_id == user_id else role_map.get(org.id, OrgRole.MEMBER.value)

        results.append({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "avatar_url": org.avatar_url,
            "owner_id": org.owner_id,
            "created_at": org.created_at,
            "my_role": role,
            "members_count": members_count,
            "repositories_count": repos_count,
        })
    return results


def get_organization_detail(db: Session, org: Organization, user_id: int) -> dict:
    members_count = db.scalar(
        select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org.id)
    ) or 0
    repos_count = db.scalar(
        select(func.count(OrganizationRepository.id)).where(OrganizationRepository.organization_id == org.id)
    ) or 0
    
    member = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == user_id
        )
    )
    role = OrgRole.OWNER.value if org.owner_id == user_id else (member.role if member else None)

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "avatar_url": org.avatar_url,
        "owner_id": org.owner_id,
        "created_at": org.created_at,
        "my_role": role,
        "members_count": members_count,
        "repositories_count": repos_count,
    }


def update_organization(db: Session, org: Organization, data: OrganizationUpdate, user_id: int, ip_address: str | None = None) -> Organization:
    if data.name is not None:
        org.name = data.name
    if data.avatar_url is not None:
        org.avatar_url = data.avatar_url
    db.commit()
    db.refresh(org)

    record_audit_log(
        db=db,
        action="org.update",
        resource_type="organization",
        user_id=user_id,
        org_id=org.id,
        resource_id=str(org.id),
        details={"name": org.name, "avatar_url": org.avatar_url},
        ip_address=ip_address
    )
    return org


def delete_organization(db: Session, org: Organization, user_id: int, ip_address: str | None = None) -> None:
    org_id = org.id
    record_audit_log(
        db=db,
        action="org.delete",
        resource_type="organization",
        user_id=user_id,
        org_id=org_id,
        resource_id=str(org_id),
        details={"name": org.name, "slug": org.slug},
        ip_address=ip_address
    )
    db.delete(org)
    db.commit()


def add_organization_member(
    db: Session,
    org: Organization,
    target_user: User,
    role: str,
    user_id: int,
    ip_address: str | None = None
) -> OrganizationMember:
    existing = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == target_user.id
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member of this organization")

    member = OrganizationMember(
        organization_id=org.id,
        user_id=target_user.id,
        role=role
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    record_audit_log(
        db=db,
        action="member.add",
        resource_type="member",
        user_id=user_id,
        org_id=org.id,
        resource_id=str(target_user.id),
        details={"target_login": target_user.login, "role": role},
        ip_address=ip_address
    )
    return member


def update_member_role(
    db: Session,
    org: Organization,
    target_user_id: int,
    new_role: str,
    user_id: int,
    ip_address: str | None = None
) -> OrganizationMember:
    if target_user_id == org.owner_id and new_role != OrgRole.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot downgrade organization owner role."
        )

    member = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == target_user_id
        )
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in organization")

    old_role = member.role
    member.role = new_role
    db.commit()
    db.refresh(member)

    record_audit_log(
        db=db,
        action="member.role_update",
        resource_type="member",
        user_id=user_id,
        org_id=org.id,
        resource_id=str(target_user_id),
        details={"old_role": old_role, "new_role": new_role},
        ip_address=ip_address
    )
    return member


def remove_organization_member(
    db: Session,
    org: Organization,
    target_user_id: int,
    user_id: int,
    ip_address: str | None = None
) -> None:
    if target_user_id == org.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove organization owner."
        )

    member = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == target_user_id
        )
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in organization")

    db.delete(member)
    db.commit()

    record_audit_log(
        db=db,
        action="member.remove",
        resource_type="member",
        user_id=user_id,
        org_id=org.id,
        resource_id=str(target_user_id),
        details={},
        ip_address=ip_address
    )


def add_organization_repository(
    db: Session,
    org: Organization,
    repository: Repository,
    user_id: int,
    ip_address: str | None = None
) -> OrganizationRepository:
    existing = db.scalar(
        select(OrganizationRepository).where(
            OrganizationRepository.organization_id == org.id,
            OrganizationRepository.repository_id == repository.id
        )
    )
    if existing:
        return existing

    link = OrganizationRepository(
        organization_id=org.id,
        repository_id=repository.id
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    record_audit_log(
        db=db,
        action="repo.link",
        resource_type="repository",
        user_id=user_id,
        org_id=org.id,
        resource_id=str(repository.id),
        details={"full_name": repository.full_name},
        ip_address=ip_address
    )
    return link


def remove_organization_repository(
    db: Session,
    org: Organization,
    repository_id: int,
    user_id: int,
    ip_address: str | None = None
) -> None:
    link = db.scalar(
        select(OrganizationRepository).where(
            OrganizationRepository.organization_id == org.id,
            OrganizationRepository.repository_id == repository_id
        )
    )
    if link:
        db.delete(link)
        db.commit()
        record_audit_log(
            db=db,
            action="repo.unlink",
            resource_type="repository",
            user_id=user_id,
            org_id=org.id,
            resource_id=str(repository_id),
            details={},
            ip_address=ip_address
        )
