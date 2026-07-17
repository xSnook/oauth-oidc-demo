import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


def set_test_env_default(name: str, value: str) -> None:
    if not os.environ.get(name):
        os.environ[name] = value


set_test_env_default("APP_ENV", "local")
set_test_env_default(
    "DATABASE_URL", "mysql+pymysql://appuser:apppass@mysql:3306/appdb?charset=utf8mb4"
)
set_test_env_default(
    "SESSION_JWT_SECRET", "test-only-secret-0123456789abcdef0123456789abcdef"
)
set_test_env_default("COOKIE_SECURE", "false")
set_test_env_default("GOOGLE_CLIENT_ID", "test-google-client")
set_test_env_default("AZURE_CLIENT_ID", "")
set_test_env_default("RATE_LIMIT_ENABLED", "false")
os.environ["ADMIN_EMAILS"] = "admin@example.com"

from app.db import get_db  # noqa: E402
from app.main import create_app  # noqa: E402

engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")


@pytest.fixture(autouse=True)
def clean_database():
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM user_identities"))
        conn.execute(text("DELETE FROM users"))
        conn.execute(text("ALTER TABLE user_identities AUTO_INCREMENT = 1"))
        conn.execute(text("ALTER TABLE users AUTO_INCREMENT = 1"))


@pytest.fixture
def client():
    app = create_app()

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
