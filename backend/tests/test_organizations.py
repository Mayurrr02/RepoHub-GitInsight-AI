from app.core.security import create_access_token
from app.models.models import Organization, OrganizationMember, OrgRole, Repository, User


def test_organization_crud_and_rbac(client, db):
    # 1. Create users
    alice = User(github_id=1001, login="alice", name="Alice Smith")
    bob = User(github_id=1002, login="bob", name="Bob Jones")
    charlie = User(github_id=1003, login="charlie", name="Charlie Brown")
    db.add_all([alice, bob, charlie])
    db.commit()

    alice_token = create_access_token(alice.id)
    bob_token = create_access_token(bob.id)
    charlie_token = create_access_token(charlie.id)

    # 2. Alice creates an organization
    create_resp = client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"name": "Acme Corp", "slug": "acme-corp"}
    )
    assert create_resp.status_code == 201
    org_data = create_resp.json()
    org_id = org_data["id"]
    assert org_data["slug"] == "acme-corp"
    assert org_data["my_role"] == "owner"
    assert org_data["members_count"] == 1

    # 3. Duplicate slug fails
    dup_resp = client.post(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"name": "Acme Corp 2", "slug": "acme-corp"}
    )
    assert dup_resp.status_code == 409

    # 4. List user's organizations
    list_resp = client.get(
        "/api/v1/organizations",
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 5. Bob attempts to access org before joining -> 403 Forbidden
    bob_get = client.get(
        f"/api/v1/organizations/{org_id}",
        headers={"Authorization": f"Bearer {bob_token}"}
    )
    assert bob_get.status_code == 403

    # 6. Alice adds Bob as Member
    add_bob_resp = client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"login": "bob", "role": "member"}
    )
    assert add_bob_resp.status_code == 201
    assert add_bob_resp.json()["role"] == "member"

    # 7. Bob can now access the organization
    bob_get_ok = client.get(
        f"/api/v1/organizations/{org_id}",
        headers={"Authorization": f"Bearer {bob_token}"}
    )
    assert bob_get_ok.status_code == 200
    assert bob_get_ok.json()["my_role"] == "member"

    # 8. Bob (member) cannot add Charlie (requires admin) -> 403
    bob_add_charlie = client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {bob_token}"},
        json={"login": "charlie", "role": "viewer"}
    )
    assert bob_add_charlie.status_code == 403

    # 9. Alice promotes Bob to Admin
    promote_resp = client.put(
        f"/api/v1/organizations/{org_id}/members/{bob.id}",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"role": "admin"}
    )
    assert promote_resp.status_code == 200
    assert promote_resp.json()["role"] == "admin"

    # 10. Bob (now admin) adds Charlie
    bob_add_charlie_ok = client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {bob_token}"},
        json={"login": "charlie", "role": "viewer"}
    )
    assert bob_add_charlie_ok.status_code == 201

    # 11. Link a repository to the organization
    repo = Repository(
        user_id=alice.id,
        github_id=501,
        name="web-service",
        full_name="acme/web-service",
        html_url="https://github.com/acme/web-service",
        description="Core web service",
        is_private=False,
        language="TypeScript",
        stars=42
    )
    db.add(repo)
    db.commit()

    link_repo_resp = client.post(
        f"/api/v1/organizations/{org_id}/repositories/{repo.id}",
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    assert link_repo_resp.status_code == 201

    # 12. List org repositories
    org_repos = client.get(
        f"/api/v1/organizations/{org_id}/repositories",
        headers={"Authorization": f"Bearer {charlie_token}"}
    )
    assert org_repos.status_code == 200
    assert len(org_repos.json()) == 1
    assert org_repos.json()[0]["repository"]["name"] == "web-service"
