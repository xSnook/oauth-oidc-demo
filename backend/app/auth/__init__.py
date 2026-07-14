from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class VerifiedIdentity:
    provider: Literal["google", "microsoft"]
    subject: str
    email: str
    display_name: str
    tenant_id: str | None = None
