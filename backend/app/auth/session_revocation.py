from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import settings

REVOCATION_KEY_PREFIX = "revoked_jti:"


def revoked_jti_key(jti: str) -> str:
    return f"{REVOCATION_KEY_PREFIX}{jti}"


def get_session_redis() -> Redis | None:
    if not settings.redis_url:
        return None
    return Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)


async def revoke_session_jti(jti: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return

    redis = get_session_redis()
    if redis is None:
        return

    try:
        await redis.set(revoked_jti_key(jti), "1", ex=ttl_seconds)
    finally:
        await redis.aclose()


async def is_session_jti_revoked(jti: str) -> bool:
    redis = get_session_redis()
    if redis is None:
        return False

    try:
        return bool(await redis.exists(revoked_jti_key(jti)))
    except RedisError:
        return True
    finally:
        await redis.aclose()
