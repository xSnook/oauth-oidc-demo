from datetime import UTC, datetime

from sqlalchemy import select

from app.auth import VerifiedIdentity
from app.models import User, UserIdentity
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
    assert body["role"] == "user"
    assert body["auth_providers"] == ["google"]

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "user@example.com"))
        identity = db.scalar(select(UserIdentity))
        assert user is not None
        assert identity is not None
        assert identity.provider_subject == "google-sub-1"


def test_admin_email_is_promoted_only_on_first_login(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(email="admin@example.com"),
    )

    first = client.post("/api/auth/google", json={"id_token": "token"})
    assert first.status_code == 200
    assert first.json()["role"] == "admin"

    with TestingSessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "admin@example.com"))
        assert user is not None
        user.role = "user"
        db.commit()

    second = client.post("/api/auth/google", json={"id_token": "token"})
    assert second.status_code == 200
    assert second.json()["role"] == "user"


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


def test_logout_clears_cookie(client, monkeypatch):
    monkeypatch.setattr(
        "app.auth.google.verify_id_token",
        lambda raw_token: _google_identity(),
    )
    assert (
        client.post("/api/auth/google", json={"id_token": "token"}).status_code == 200
    )

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert "session=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_microsoft_endpoint_returns_404(client):
    response = client.post("/api/auth/microsoft", json={"id_token": "token"})

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "NOT_FOUND"
