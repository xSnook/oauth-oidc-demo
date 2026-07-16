from datetime import UTC, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_serializer

Provider = Literal["google", "microsoft"]


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    USER = "user"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str | None
    role: Role
    is_active: bool
    auth_providers: list[Provider]
    created_at: datetime
    last_login_at: datetime | None

    @field_serializer("created_at", "last_login_at")
    def serialize_datetime(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


class UserListOut(BaseModel):
    items: list[UserOut]
    total: int


class RoleUpdateRequest(BaseModel):
    role: Role


class StatusUpdateRequest(BaseModel):
    is_active: bool
