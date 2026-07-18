import pytest

from app.auth import google


def _claims(nonce: str = "nonce-123") -> dict[str, object]:
    return {
        "iss": "https://accounts.google.com",
        "email_verified": True,
        "sub": "google-sub",
        "email": "USER@EXAMPLE.COM",
        "name": "Test User",
        "nonce": nonce,
    }


def test_verify_id_token_requires_matching_nonce(monkeypatch):
    monkeypatch.setattr(
        google.id_token,
        "verify_oauth2_token",
        lambda raw_token, request, audience, clock_skew_in_seconds: _claims("other"),
    )

    with pytest.raises(google.ProviderTokenError, match="nonce"):
        google.verify_id_token("token", expected_nonce="nonce-123")


def test_verify_id_token_returns_identity_when_nonce_matches(monkeypatch):
    monkeypatch.setattr(
        google.id_token,
        "verify_oauth2_token",
        lambda raw_token, request, audience, clock_skew_in_seconds: _claims(),
    )

    identity = google.verify_id_token("token", expected_nonce="nonce-123")

    assert identity.provider == "google"
    assert identity.subject == "google-sub"
    assert identity.email == "user@example.com"
