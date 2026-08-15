from app.core.security import create_access_token
from app.models.models import Organization, OrganizationMember, User


def test_audit_logs_recording_and_retrieval(client, db):
    admin = User(github_id=3001, login="org_admin", name="Admin")
    member = User(github_id=3002, login="team_user", name="User")
    db.add_all([admin, member])
    db.commit()

    admin_token = create_access_token(admin.id)
    member_token = create_access_token(member.id)

    # 1. Admin creates organization (triggers org.create audit)
    create_resp = client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Audit Test Corp", "slug": "audit-test-corp"}
    )
    assert create_resp.status_code == 201
    org_id = create_resp.json()["id"]

    # 2. Admin adds member (triggers member.add audit)
    add_resp = client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"login": "team_user", "role": "member"}
    )
    assert add_resp.status_code == 201

    # 3. Member retrieves audit logs -> 403 Forbidden (requires admin)
    member_audit = client.get(
        f"/api/v1/organizations/{org_id}/audit-logs",
        headers={"Authorization": f"Bearer {member_token}"}
    )
    assert member_audit.status_code == 403

    # 4. Admin retrieves audit logs -> 200 OK
    admin_audit = client.get(
        f"/api/v1/organizations/{org_id}/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_audit.status_code == 200
    data = admin_audit.json()
    assert data["total"] >= 2
    actions = [log["action"] for log in data["logs"]]
    assert "org.create" in actions
    assert "member.add" in actions
