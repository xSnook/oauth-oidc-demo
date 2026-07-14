from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=False, extra="ignore"
    )

    app_env: Literal["local", "production"] = "local"
    database_url: str
    db_require_tls: bool = False
    session_jwt_secret: str
    session_ttl_hours: int = 8
    cookie_secure: bool = True
    google_client_id: str = ""
    azure_client_id: str = ""
    azure_admin_tenant_id: str = ""
    admin_emails: str = ""
    log_level: str = "INFO"

    @field_validator("session_jwt_secret")
    @classmethod
    def secret_must_be_strong(cls, v: str) -> str:
        if len(v) < 32 or "replace-me" in v:
            raise ValueError(
                "SESSION_JWT_SECRET must be >=32 chars and not the placeholder"
            )
        return v

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


settings = Settings()
