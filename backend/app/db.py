from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

connect_args = {}
if settings.db_require_tls:
    connect_args["ssl"] = {"ca": "/app/rds-global-bundle.pem"}

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=280,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
