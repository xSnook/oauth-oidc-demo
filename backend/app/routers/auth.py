from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from jwt import InvalidTokenError
from redis.exceptions import RedisError
from sqlalchemy.orm import Session, selectinload

from app.auth import google
from app.auth.deps import get_current_user
from app.auth.jwt import (
    SESSION_COOKIE_NAME,
    clear_session_cookie,
    create_session_token,
    decode_session_token,
    remaining_session_ttl_seconds,
    set_session_cookie,
)
from app.auth.session_revocation import revoke_session_jti
from app.auth.service import AccountDisabled, find_or_create_user
from app.db import get_db
from app.errors import app_error
from app.models import User
from app.schemas.auth import TokenLoginRequest
from app.schemas.user import UserOut
from app.serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


def require_json(request: Request) -> None:
    content_type = request.headers.get("content-type", "")
    if content_type.split(";")[0].strip().lower() != "application/json":
        raise app_error(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "UNSUPPORTED_MEDIA_TYPE",
            "Content-Type must be application/json",
        )


@router.post("/google", response_model=UserOut, dependencies=[Depends(require_json)])
def login_google(
    response: Response,
    body: TokenLoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    try:
        ident = google.verify_id_token(body.id_token)
        user = find_or_create_user(db, ident)
    except google.ProviderTokenError as exc:
        raise app_error(
            status.HTTP_401_UNAUTHORIZED,
            "INVALID_TOKEN",
            "Google ID token is invalid",
        ) from exc
    except AccountDisabled as exc:
        raise app_error(
            status.HTTP_403_FORBIDDEN,
            "ACCOUNT_DISABLED",
            "This account is disabled",
        ) from exc

    set_session_cookie(response, create_session_token(user.id, user.token_version))
    return user_out(user)


@router.post("/microsoft")
def login_microsoft() -> None:
    raise app_error(
        status.HTTP_404_NOT_FOUND,
        "NOT_FOUND",
        "Microsoft sign-in is not configured for this local build",
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> None:
    if session:
        try:
            payload = decode_session_token(session)
            await revoke_session_jti(
                payload.jti, remaining_session_ttl_seconds(payload)
            )
        except (InvalidTokenError, RedisError):
            pass
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
def me(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserOut:
    user = (
        db.query(User)
        .options(selectinload(User.identities))
        .filter(User.id == current_user.id)
        .one()
    )
    return user_out(user)
