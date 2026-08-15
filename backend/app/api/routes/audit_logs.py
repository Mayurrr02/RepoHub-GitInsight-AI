from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.rbac import require_org_role
from app.db.session import get_db
from app.models.models import Organization, OrgRole
from app.schemas.schemas import AuditLogsResponse
from app.services.audit import get_org_audit_logs

router = APIRouter(prefix="/organizations/{id}/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=AuditLogsResponse)
def list_org_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    org_and_role: tuple[Organization, str] = Depends(require_org_role(OrgRole.ADMIN.value)),
    db: Session = Depends(get_db)
):
    org, _ = org_and_role
    logs, total = get_org_audit_logs(
        db=db,
        org_id=org.id,
        limit=limit,
        offset=offset,
        action=action
    )
    return {
        "total": total,
        "logs": logs
    }
