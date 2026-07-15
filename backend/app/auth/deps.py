from typing import Annotated

from fastapi import Cookie, Depends, status
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.auth.jwt import SESSION_COOKIE_NAME, decode_session_token
from app.db import get_db
from app.errors import app_error, not_authenticated
from app.models import User


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> User:
    if not session:
        raise not_authenticated()

    try:
        user_id = decode_session_token(session)
    except InvalidTokenError as exc:
        raise app_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_SESSION",
            "Session is invalid or expired",
        ) from exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise app_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_SESSION",
            "Session is invalid or expired",
        )
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise app_error(status.HTTP_403_FORBIDDEN, "FORBIDDEN", "Admin access required")
    return user
