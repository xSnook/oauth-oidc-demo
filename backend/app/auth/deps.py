from typing import Annotated

from fastapi import Cookie, Depends, status
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.auth.jwt import SESSION_COOKIE_NAME, decode_session_token
from app.auth.session_revocation import is_session_jti_revoked
from app.db import get_db
from app.errors import app_error, not_authenticated
from app.models import User
from app.schemas.user import Role


async def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> User:
    if not session:
        raise not_authenticated()

    try:
        token_payload = decode_session_token(session)
    except InvalidTokenError as exc:
        raise app_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_SESSION",
            "Session is invalid or expired",
        ) from exc

    if await is_session_jti_revoked(token_payload.jti):
        raise app_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_SESSION",
            "Session is invalid or expired",
        )

    user = db.get(User, token_payload.user_id)
    if (
        not user
        or not user.is_active
        or user.token_version != token_payload.token_version
    ):
        raise app_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_SESSION",
            "Session is invalid or expired",
        )
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in {Role.OWNER, Role.ADMIN}:
        raise app_error(status.HTTP_403_FORBIDDEN, "FORBIDDEN", "Admin access required")
    return user
