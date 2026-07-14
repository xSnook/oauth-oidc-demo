from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Response
from jwt import InvalidTokenError

from app.config import settings

SESSION_COOKIE_NAME = "session"
SESSION_ALGORITHM = "HS256"


def create_session_token(user_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.session_ttl_hours),
    }
    return jwt.encode(payload, settings.session_jwt_secret, algorithm=SESSION_ALGORITHM)


def decode_session_token(token: str) -> int:
    try:
        payload = jwt.decode(
            token,
            settings.session_jwt_secret,
            algorithms=[SESSION_ALGORITHM],
            options={"require": ["exp", "iat", "sub"]},
        )
        return int(payload["sub"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise InvalidTokenError("Invalid session token") from exc


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=settings.session_ttl_hours * 3600,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
