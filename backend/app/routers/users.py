from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.deps import require_admin
from app.db import get_db
from app.errors import app_error
from app.models import User
from app.schemas.user import (
    RoleUpdateRequest,
    StatusUpdateRequest,
    UserListOut,
    UserOut,
)
from app.serializers import user_out

router = APIRouter(prefix="/api/users", tags=["users"])


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.scalar(
        select(User).options(selectinload(User.identities)).where(User.id == user_id)
    )
    if not user:
        raise app_error(status.HTTP_404_NOT_FOUND, "NOT_FOUND", "User not found")
    return user


def _is_owner(user: User) -> bool:
    return user.role == "owner"


def _ensure_owner_mutation_allowed(current_user: User, target_user: User) -> None:
    if _is_owner(target_user) and not _is_owner(current_user):
        raise app_error(
            status.HTTP_403_FORBIDDEN,
            "CANNOT_MODIFY_OWNER",
            "Only owners can modify owner accounts",
        )


@router.get("", response_model=UserListOut)
def list_users(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_admin)],
) -> UserListOut:
    users = list(
        db.scalars(
            select(User)
            .options(selectinload(User.identities))
            .order_by(User.created_at)
        )
    )
    return UserListOut(items=[user_out(user) for user in users], total=len(users))


@router.patch("/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    body: RoleUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_admin)],
) -> UserOut:
    if user_id == current_user.id:
        raise app_error(
            status.HTTP_400_BAD_REQUEST,
            "CANNOT_MODIFY_SELF",
            "You cannot change your own role",
        )

    user = _get_user_or_404(db, user_id)
    _ensure_owner_mutation_allowed(current_user, user)
    if body.role == "owner" and not _is_owner(current_user):
        raise app_error(
            status.HTTP_403_FORBIDDEN,
            "CANNOT_ASSIGN_OWNER",
            "Only owners can assign the owner role",
        )
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.patch("/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    body: StatusUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_admin)],
) -> UserOut:
    if user_id == current_user.id:
        raise app_error(
            status.HTTP_400_BAD_REQUEST,
            "CANNOT_MODIFY_SELF",
            "You cannot deactivate yourself",
        )

    user = _get_user_or_404(db, user_id)
    _ensure_owner_mutation_allowed(current_user, user)
    user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return user_out(user)
