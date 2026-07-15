from app.models import User
from app.schemas.user import UserOut


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        auth_providers=[identity.provider for identity in user.identities],
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )
