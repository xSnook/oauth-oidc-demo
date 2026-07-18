from sqlalchemy import select

from app.auth import VerifiedIdentity
from app.auth.jwt import SESSION_COOKIE_NAME
from app.models import User
from app.schemas.user import Role
from tests.conftest import TestingSessionLocal


def _identity(email: str, subject: str, display_name: str = "Test User"):
    return VerifiedIdentity(
        provider="google",
        subject=subject,
        email=email,
        display_name=display_name,
    )


def _login(
    client, monkeypatch, email: str, subject: str, display_name: str = "Test User"
):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token, expected_nonce: _identity(email, subject, display_name),
    )
    response = client.post(
        "/api/auth/google", json={"id_token": f"token-{subject}", "nonce": "nonce"}
    )
    assert response.status_code == 200
    return response.json()


def _set_role(email: str, role: Role) -> None:
    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.role = role
        db.commit()


def _set_active(email: str, is_active: bool) -> None:
    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.is_active = is_active
        db.commit()


def test_admin_can_list_users(client, monkeypatch):
    admin = _login(client, monkeypatch, "admin@example.com", "admin-sub", "Admin User")
    _login(client, monkeypatch, "user@example.com", "user-sub", "Regular User")
    _login(client, monkeypatch, "admin@example.com", "admin-sub", "Admin User")

    response = client.get("/api/users")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert [item["email"] for item in body["items"]] == [
        "admin@example.com",
        "user@example.com",
    ]
    assert body["items"][0]["id"] == admin["id"]
    assert body["items"][0]["auth_providers"] == ["google"]


def test_non_admin_cannot_list_users(client, monkeypatch):
    _login(client, monkeypatch, "user@example.com", "user-sub")

    response = client.get("/api/users")

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN"


def test_admin_can_update_user_role(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")
    user = _login(client, monkeypatch, "user@example.com", "user-sub")
    _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(f"/api/users/{user['id']}/role", json={"role": Role.ADMIN})

    assert response.status_code == 200
    assert response.json()["role"] == Role.ADMIN


def test_admin_role_change_invalidates_user_session(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token, expected_nonce: _identity("user@example.com", "user-sub"),
    )
    user_login = client.post(
        "/api/auth/google", json={"id_token": "token-user-sub", "nonce": "nonce"}
    )
    assert user_login.status_code == 200
    user = user_login.json()
    user_session = user_login.cookies[SESSION_COOKIE_NAME]
    _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(f"/api/users/{user['id']}/role", json={"role": Role.ADMIN})

    assert response.status_code == 200
    with TestingSessionLocal() as db:
        changed_user = db.get(User, user["id"])
        assert changed_user is not None
        assert changed_user.token_version == 1
    client.cookies.set(SESSION_COOKIE_NAME, user_session)
    stale_response = client.get("/api/auth/me")
    assert stale_response.status_code == 401


def test_owner_can_assign_owner_role(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")
    user = _login(client, monkeypatch, "user@example.com", "user-sub")
    _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(f"/api/users/{user['id']}/role", json={"role": Role.OWNER})

    assert response.status_code == 200
    assert response.json()["role"] == Role.OWNER


def test_admin_cannot_assign_owner_role(client, monkeypatch):
    _login(client, monkeypatch, "helper@example.com", "helper-sub")
    _set_role("helper@example.com", Role.ADMIN)
    user = _login(client, monkeypatch, "user@example.com", "user-sub")
    _login(client, monkeypatch, "helper@example.com", "helper-sub")

    response = client.patch(f"/api/users/{user['id']}/role", json={"role": Role.OWNER})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CANNOT_ASSIGN_OWNER"


def test_admin_cannot_change_owner_role(client, monkeypatch):
    owner = _login(client, monkeypatch, "admin@example.com", "owner-sub")
    admin = _login(client, monkeypatch, "helper@example.com", "helper-sub")
    _set_role("helper@example.com", Role.ADMIN)
    _login(client, monkeypatch, "helper@example.com", "helper-sub")

    response = client.patch(f"/api/users/{owner['id']}/role", json={"role": Role.ADMIN})

    assert admin["role"] == Role.USER
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CANNOT_MODIFY_OWNER"


def test_admin_cannot_change_own_role(client, monkeypatch):
    admin = _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(f"/api/users/{admin['id']}/role", json={"role": Role.USER})

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "CANNOT_MODIFY_SELF"


def test_admin_can_update_user_status(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")
    user = _login(client, monkeypatch, "user@example.com", "user-sub")
    _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(
        f"/api/users/{user['id']}/status", json={"is_active": False}
    )

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_admin_status_change_invalidates_user_session(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token, expected_nonce: _identity("user@example.com", "user-sub"),
    )
    user_login = client.post(
        "/api/auth/google", json={"id_token": "token-user-sub", "nonce": "nonce"}
    )
    assert user_login.status_code == 200
    user = user_login.json()
    user_session = user_login.cookies[SESSION_COOKIE_NAME]
    _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(
        f"/api/users/{user['id']}/status", json={"is_active": False}
    )

    assert response.status_code == 200
    with TestingSessionLocal() as db:
        changed_user = db.get(User, user["id"])
        assert changed_user is not None
        assert changed_user.token_version == 1
    client.cookies.set(SESSION_COOKIE_NAME, user_session)
    stale_response = client.get("/api/auth/me")
    assert stale_response.status_code == 401


def test_admin_cannot_deactivate_owner(client, monkeypatch):
    owner = _login(client, monkeypatch, "admin@example.com", "owner-sub")
    _login(client, monkeypatch, "helper@example.com", "helper-sub")
    _set_role("helper@example.com", Role.ADMIN)
    _login(client, monkeypatch, "helper@example.com", "helper-sub")

    response = client.patch(
        f"/api/users/{owner['id']}/status", json={"is_active": False}
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CANNOT_MODIFY_OWNER"


def test_admin_cannot_deactivate_self(client, monkeypatch):
    admin = _login(client, monkeypatch, "admin@example.com", "admin-sub")

    response = client.patch(
        f"/api/users/{admin['id']}/status", json={"is_active": False}
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "CANNOT_MODIFY_SELF"


def test_missing_user_returns_404(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")

    role_response = client.patch("/api/users/999/role", json={"role": Role.USER})
    status_response = client.patch("/api/users/999/status", json={"is_active": True})

    assert role_response.status_code == 404
    assert role_response.json()["detail"]["code"] == "NOT_FOUND"
    assert status_response.status_code == 404
    assert status_response.json()["detail"]["code"] == "NOT_FOUND"


def test_dashboard_requires_session(client):
    response = client.get("/api/dashboard")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "NOT_AUTHENTICATED"


def test_dashboard_returns_real_counts(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub", "Admin User")
    _login(client, monkeypatch, "user@example.com", "user-sub", "Regular User")
    _set_active("user@example.com", False)
    _login(client, monkeypatch, "admin@example.com", "admin-sub", "Admin User")

    response = client.get("/api/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Welcome, Admin User"
    assert body["stats"] == {"total_users": 2, "active_users": 1}


def test_non_admin_cannot_update_user_role(client, monkeypatch):
    _login(client, monkeypatch, "admin@example.com", "admin-sub")
    _set_role("admin@example.com", Role.USER)
    other_user = _login(client, monkeypatch, "other@example.com", "other-sub")

    response = client.patch(
        f"/api/users/{other_user['id']}/role", json={"role": Role.ADMIN}
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "FORBIDDEN"
