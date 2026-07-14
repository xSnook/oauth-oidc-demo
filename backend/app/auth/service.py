from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import VerifiedIdentity
from app.config import settings
from app.models import User, UserIdentity


class AccountDisabled(Exception):
    pass


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _lookup_identity(db: Session, ident: VerifiedIdentity) -> UserIdentity | None:
    return db.scalar(
        select(UserIdentity)
        .options(selectinload(UserIdentity.user).selectinload(User.identities))
        .where(
            UserIdentity.provider == ident.provider,
            UserIdentity.provider_subject == ident.subject,
        )
    )


def find_or_create_user(db: Session, ident: VerifiedIdentity) -> User:
    identity = _lookup_identity(db, ident)
    if identity:
        user = identity.user
        if not user.is_active:
            raise AccountDisabled
        user.last_login_at = _utcnow()
        identity.provider_email = ident.email
        db.commit()
        db.refresh(user)
        return user

    is_admin = ident.email in settings.admin_email_set and (
        ident.provider == "google"
        or (
            ident.provider == "microsoft"
            and settings.azure_admin_tenant_id
            and ident.tenant_id == settings.azure_admin_tenant_id
        )
    )
    user = User(
        email=ident.email,
        display_name=ident.display_name,
        role="admin" if is_admin else "user",
        is_active=True,
        last_login_at=_utcnow(),
    )
    db.add(user)
    db.add(
        UserIdentity(
            user=user,
            provider=ident.provider,
            provider_subject=ident.subject,
            provider_email=ident.email,
        )
    )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        identity = _lookup_identity(db, ident)
        if not identity:
            raise
        user = identity.user
        if not user.is_active:
            raise AccountDisabled
        user.last_login_at = _utcnow()
        identity.provider_email = ident.email
        db.commit()
        db.refresh(user)
        return user

    db.refresh(user)
    return user
