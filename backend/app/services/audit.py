import json
import logging
from typing import Any
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.metrics import audit_events_total
from app.models.models import AuditLog, User

logger = logging.getLogger("repohub.audit")


def record_audit_log(
    db: Session,
    action: str,
    resource_type: str,
    user_id: int | None = None,
    org_id: int | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Record an audit trail event in the database."""
    details_str = json.dumps(details) if isinstance(details, dict) else (details or "")
    
    log = AuditLog(
        user_id=user_id,
        organization_id=org_id,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=details_str,
        ip_address=ip_address,
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    try:
        audit_events_total.labels(action=action).inc()
    except Exception:
        pass

    logger.info(f"AUDIT: action={action} user_id={user_id} org_id={org_id} resource={resource_type}:{resource_id}")
    return log


def get_org_audit_logs(
    db: Session,
    org_id: int,
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Retrieve paginated audit logs for an organization."""
    query = select(AuditLog).where(AuditLog.organization_id == org_id)
    count_query = select(func.count(AuditLog.id)).where(AuditLog.organization_id == org_id)

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)

    total = db.scalar(count_query) or 0
    logs = db.scalars(query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)).all()

    result = []
    for item in logs:
        user = db.get(User, item.user_id) if item.user_id else None
        result.append({
            "id": item.id,
            "user_id": item.user_id,
            "user_login": user.login if user else None,
            "organization_id": item.organization_id,
            "action": item.action,
            "resource_type": item.resource_type,
            "resource_id": item.resource_id,
            "details": item.details,
            "ip_address": item.ip_address,
            "created_at": item.created_at,
        })
    return result, total
