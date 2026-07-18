from typing import Annotated, Any, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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
    redis_url: str = ""
    rate_limit_enabled: bool = True
    rate_limit_fail_open: bool = True
    rate_limit_auth_per_minute: int = 10
    rate_limit_logout_per_minute: int = 30
    rate_limit_api_per_minute: int = 120
    rate_limit_admin_write_per_minute: int = 30
    trusted_proxy_cidrs: Annotated[list[str], NoDecode] = []

    @field_validator("session_jwt_secret")
    @classmethod
    def secret_must_be_strong(cls, v: str) -> str:
        if len(v) < 32 or "replace-me" in v:
            raise ValueError(
                "SESSION_JWT_SECRET must be >=32 chars and not the placeholder"
            )
        return v

    @field_validator("trusted_proxy_cidrs", mode="before")
    @classmethod
    def parse_trusted_proxy_cidrs(cls, v: Any) -> list[str]:
        if v is None or v == "":
            return []
        if isinstance(v, str):
            return [cidr.strip() for cidr in v.split(",") if cidr.strip()]
        return v

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


settings = Settings()
