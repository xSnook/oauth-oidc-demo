import secrets

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import settings

NONCE_KEY_PREFIX = "oidc_nonce:"
NONCE_TTL_SECONDS = 300


class OidcNonceError(Exception):
    pass


def oidc_nonce_key(nonce: str) -> str:
    return f"{NONCE_KEY_PREFIX}{nonce}"


def get_oidc_nonce_redis() -> Redis | None:
    if not settings.redis_url:
        return None
    return Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)


async def issue_oidc_nonce() -> str:
    redis = get_oidc_nonce_redis()
    if redis is None:
        raise OidcNonceError("OIDC nonce store is not configured")

    try:
        for _ in range(3):
            nonce = secrets.token_urlsafe(32)
            created = await redis.set(
                oidc_nonce_key(nonce), "1", ex=NONCE_TTL_SECONDS, nx=True
            )
            if created:
                return nonce
    except RedisError as exc:
        raise OidcNonceError("OIDC nonce store is unavailable") from exc
    finally:
        await redis.aclose()

    raise OidcNonceError("Unable to issue OIDC nonce")


async def consume_oidc_nonce(nonce: str) -> None:
    redis = get_oidc_nonce_redis()
    if redis is None:
        raise OidcNonceError("OIDC nonce store is not configured")

    try:
        consumed = await redis.execute_command("GETDEL", oidc_nonce_key(nonce))
    except RedisError as exc:
        raise OidcNonceError("OIDC nonce store is unavailable") from exc
    finally:
        await redis.aclose()

    if consumed is None:
        raise OidcNonceError("OIDC nonce is invalid or expired")
