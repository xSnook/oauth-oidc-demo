from datetime import UTC, datetime

from sqlalchemy import select

from app.auth import VerifiedIdentity
from app.auth.jwt import (
    SESSION_COOKIE_NAME,
    create_session_token,
    decode_session_token,
    remaining_session_ttl_seconds,
)
from app.models import User, UserIdentity
from app.schemas.user import Role
from tests.conftest import TestingSessionLocal


def _google_identity(email: str = "user@example.com", subject: str = "google-sub-1"):
    return VerifiedIdentity(
        provider="google",
        subject=subject,
        email=email,
        display_name="Test User",
    )


def test_first_google_login_provisions_user_and_sets_cookie(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )

    response = client.post("/api/auth/google", json={"id_token": "token"})

    assert response.status_code == 200
    assert "session=" in response.headers["set-cookie"]
    body = response.json()
    assert body["email"] == "user@example.com"
    assert body["role"] == Role.USER
    assert body["auth_providers"] == ["google"]

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "user@example.com"))
        identity = db.scalar(select(UserIdentity))
        assert user is not None
        assert identity is not None
        assert identity.provider_subject == "google-sub-1"


def test_configured_admin_email_is_owner_on_first_login_only(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(email="admin@example.com"),
    )

    first = client.post("/api/auth/google", json={"id_token": "token"})
    assert first.status_code == 200
    assert first.json()["role"] == Role.OWNER

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "admin@example.com"))
        assert user is not None
        user.role = Role.USER
        db.commit()

    second = client.post("/api/auth/google", json={"id_token": "token"})
    assert second.status_code == 200
    assert second.json()["role"] == Role.USER


def test_repeat_login_updates_last_login(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )

    first = client.post("/api/auth/google", json={"id_token": "token"})
    assert first.status_code == 200
    first_login = datetime.fromisoformat(
        first.json()["last_login_at"].replace("Z", "+00:00")
    )

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "user@example.com"))
        assert user is not None
        user.last_login_at = datetime(2026, 1, 1)
        db.commit()

    second = client.post("/api/auth/google", json={"id_token": "token"})
    assert second.status_code == 200
    second_login = datetime.fromisoformat(
        second.json()["last_login_at"].replace("Z", "+00:00")
    )
    assert second_login > datetime(2026, 1, 1, tzinfo=UTC)
    assert second_login >= first_login


def test_disabled_account_cannot_login_and_gets_no_cookie(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )
    assert (
        client.post("/api/auth/google", json={"id_token": "token"}).status_code == 200
    )

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "user@example.com"))
        assert user is not None
        user.is_active = False
        db.commit()

    response = client.post("/api/auth/google", json={"id_token": "token"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "ACCOUNT_DISABLED"
    assert "session=" not in response.headers.get("set-cookie", "")


def test_invalid_google_token_returns_401(client, monkeypatch):
    from app.auth.google import ProviderTokenError

    def raise_invalid(raw_token: str):
        raise ProviderTokenError("nope")

    monkeypatch.setattr("app.auth.google.verify_id_token", raise_invalid)

    response = client.post("/api/auth/google", json={"id_token": "bad"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_TOKEN"


def test_wrong_content_type_returns_415(client):
    response = client.post(
        "/api/auth/google",
        content='{"id_token":"token"}',
        headers={"content-type": "text/plain"},
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_me_requires_session(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "NOT_AUTHENTICATED"


def test_me_returns_current_user_with_session(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )
    login = client.post("/api/auth/google", json={"id_token": "token"})
    assert login.status_code == 200

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == "user@example.com"


def test_session_token_contains_jti_and_token_version():
    token = create_session_token(user_id=123, token_version=7)

    payload = decode_session_token(token)

    assert payload.user_id == 123
    assert len(payload.jti) == 32
    assert payload.token_version == 7
    assert remaining_session_ttl_seconds(payload) > 0


def test_revoked_session_cannot_access_me(client, monkeypatch):
    async def is_revoked(jti: str) -> bool:
        return True

    monkeypatch.setattr("app.auth.deps.is_session_jti_revoked", is_revoked)
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )
    assert (
        client.post("/api/auth/google", json={"id_token": "token"}).status_code == 200
    )

    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_SESSION"


def test_stale_token_version_cannot_access_me(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )
    login = client.post("/api/auth/google", json={"id_token": "token"})
    assert login.status_code == 200

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "user@example.com"))
        assert user is not None
        user.token_version += 1
        db.commit()

    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_SESSION"


def test_logout_revokes_session_jti_and_clears_cookie(client, monkeypatch):
    revoked: dict[str, int] = {}

    async def revoke(jti: str, ttl_seconds: int) -> None:
        revoked[jti] = ttl_seconds

    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )
    monkeypatch.setattr("app.routers.auth.revoke_session_jti", revoke)
    login = client.post("/api/auth/google", json={"id_token": "token"})
    assert login.status_code == 200
    session = login.cookies[SESSION_COOKIE_NAME]
    payload = decode_session_token(session)

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert "session=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert revoked[payload.jti] > 0


def test_microsoft_endpoint_returns_404(client):
    response = client.post("/api/auth/microsoft", json={"id_token": "token"})

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "NOT_FOUND"
