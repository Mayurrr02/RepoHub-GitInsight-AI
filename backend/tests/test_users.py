from datetime import datetime, timezone
from app.core.security import create_access_token
from app.models import GitHubAccount, Organization, OrganizationMember, Repository, User


def test_user_me_and_profile(client, db):
    user = User(github_id=999, login="octotest", name="Octo Test", avatar_url="https://example.com/avatar.png")
    db.add(user)
    db.flush()

    gh_account = GitHubAccount(user_id=user.id, access_token="gho_test123", scope="read:user, repo, admin:org")
    db.add(gh_account)

    repo1 = Repository(user_id=user.id, github_id=101, name="r1", full_name="octotest/r1", html_url="https://github.com/octotest/r1", is_private=False, stars=10)
    repo2 = Repository(user_id=user.id, github_id=102, name="r2", full_name="octotest/r2", html_url="https://github.com/octotest/r2", is_private=True, stars=2)
    db.add_all([repo1, repo2])

    org = Organization(name="TestOrg", slug="test-org", owner_id=user.id)
    db.add(org)
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role="owner"))
    db.commit()

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test /users/me
    res = client.get("/api/v1/users/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["login"] == "octotest"

    # 2. Test /users/me/profile
    res_prof = client.get("/api/v1/users/me/profile", headers=headers)
    assert res_prof.status_code == 200
    pdata = res_prof.json()
    assert pdata["stats"]["total_repositories"] == 2
    assert pdata["stats"]["public_repositories"] == 1
    assert pdata["stats"]["private_repositories"] == 1
    assert pdata["stats"]["total_organizations"] == 1
    assert pdata["github_account"]["connected"] is True
    assert "repo" in pdata["github_account"]["scopes_list"]
    assert "read:user" in pdata["github_account"]["scopes_list"]


def test_api_key_lifecycle(client, db):
    user = User(github_id=888, login="keymaster", name="Key Master", avatar_url=None)
    db.add(user)
    db.commit()

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create API key
    res_create = client.post("/api/v1/users/me/api-keys", json={"name": "CLI Token", "expires_in_days": 30}, headers=headers)
    assert res_create.status_code == 201
    created_data = res_create.json()
    key_id = created_data["id"]
    raw_key = created_data["raw_key"]
    assert raw_key.startswith("rh_live_")
    assert created_data["prefix"].startswith("rh_live_")

    # 2. List API keys
    res_list = client.get("/api/v1/users/me/api-keys", headers=headers)
    assert res_list.status_code == 200
    keys = res_list.json()
    assert len(keys) == 1
    assert keys[0]["name"] == "CLI Token"

    # 3. Delete / Revoke API key
    res_del = client.delete(f"/api/v1/users/me/api-keys/{key_id}", headers=headers)
    assert res_del.status_code == 204

    # 4. Verify list is now empty
    res_list_after = client.get("/api/v1/users/me/api-keys", headers=headers)
    assert res_list_after.status_code == 200
    assert len(res_list_after.json()) == 0
