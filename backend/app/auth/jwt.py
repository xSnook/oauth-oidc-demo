from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from fastapi import Response
from jwt import InvalidTokenError

from app.config import settings

SESSION_COOKIE_NAME = "session"
SESSION_ALGORITHM = "HS256"


@dataclass(frozen=True)
class SessionTokenPayload:
    user_id: int
    jti: str
    exp: int
    token_version: int


def create_session_token(user_id: int, token_version: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.session_ttl_hours),
        "jti": uuid4().hex,
        "token_version": token_version,
    }
    return jwt.encode(payload, settings.session_jwt_secret, algorithm=SESSION_ALGORITHM)


def decode_session_token(token: str) -> SessionTokenPayload:
    try:
        payload = jwt.decode(
            token,
            settings.session_jwt_secret,
            algorithms=[SESSION_ALGORITHM],
            options={"require": ["exp", "iat", "sub", "jti", "token_version"]},
        )
        return SessionTokenPayload(
            user_id=int(payload["sub"]),
            jti=str(payload["jti"]),
            exp=int(payload["exp"]),
            token_version=int(payload["token_version"]),
        )
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise InvalidTokenError("Invalid session token") from exc


def remaining_session_ttl_seconds(payload: SessionTokenPayload) -> int:
    return max(payload.exp - int(datetime.now(UTC).timestamp()), 0)


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
