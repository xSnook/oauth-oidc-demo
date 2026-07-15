from google.auth.transport import requests
from google.oauth2 import id_token

from app.auth import VerifiedIdentity
from app.config import settings


class ProviderTokenError(Exception):
    pass


def verify_id_token(raw_token: str) -> VerifiedIdentity:
    try:
        claims = id_token.verify_oauth2_token(
            raw_token,
            requests.Request(),
            audience=settings.google_client_id,
            clock_skew_in_seconds=30,
        )
    except Exception as exc:
        raise ProviderTokenError("Invalid Google ID token") from exc

    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ProviderTokenError("Invalid Google issuer")
    if not claims.get("email_verified"):
        raise ProviderTokenError("Google email is not verified")

    subject = claims.get("sub")
    email = claims.get("email")
    if not subject or not email:
        raise ProviderTokenError("Google token missing subject or email")

    normalized_email = email.lower()
    return VerifiedIdentity(
        provider="google",
        subject=subject,
        email=normalized_email,
        display_name=claims.get("name") or normalized_email,
    )
