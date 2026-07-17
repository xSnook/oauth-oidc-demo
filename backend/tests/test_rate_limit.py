import asyncio

from fastapi.testclient import TestClient
from redis.exceptions import RedisError
from starlette.requests import Request

from app.main import create_app
from app.rate_limit import RateLimitDecision, RateLimitRule, RedisRateLimiter


def _request(
    path: str = "/api/auth/google",
    method: str = "POST",
    forwarded_for: str = "203.0.113.10",
) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [(b"x-forwarded-for", forwarded_for.encode())],
            "client": ("127.0.0.1", 12345),
            "scheme": "http",
            "server": ("testserver", 80),
            "query_string": b"",
        }
    )


class FakeRedis:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.expirations: dict[str, int] = {}
        self.closed = False

    async def incr(self, key: str) -> int:
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key: str, seconds: int) -> None:
        self.expirations[key] = seconds

    async def ttl(self, key: str) -> int:
        return self.expirations[key]

    async def aclose(self) -> None:
        self.closed = True


class BrokenRedis(FakeRedis):
    async def incr(self, key: str) -> int:
        raise RedisError("redis unavailable")


class BlockingLimiter:
    async def check(self, request: Request) -> RateLimitDecision:
        return RateLimitDecision(allowed=False, retry_after_seconds=42)

    async def close(self) -> None:
        return None


def _limiter(redis: FakeRedis, fail_open: bool = True) -> RedisRateLimiter:
    return RedisRateLimiter(
        redis,
        (
            RateLimitRule(
                name="auth_google",
                path_prefix="/api/auth/google",
                limit=2,
                methods=frozenset({"POST"}),
            ),
        ),
        fail_open=fail_open,
        clock=lambda: 60,
    )


def test_redis_rate_limiter_blocks_after_limit() -> None:
    redis = FakeRedis()
    limiter = _limiter(redis)
    request = _request()

    first = asyncio.run(limiter.check(request))
    second = asyncio.run(limiter.check(request))
    third = asyncio.run(limiter.check(request))

    assert first.allowed is True
    assert second.allowed is True
    assert third == RateLimitDecision(allowed=False, retry_after_seconds=60)


def test_redis_rate_limiter_fails_open_when_redis_is_unavailable() -> None:
    limiter = _limiter(BrokenRedis(), fail_open=True)

    decision = asyncio.run(limiter.check(_request()))

    assert decision == RateLimitDecision(allowed=True, retry_after_seconds=1)


def test_redis_rate_limiter_can_fail_closed_when_configured() -> None:
    limiter = _limiter(BrokenRedis(), fail_open=False)

    decision = asyncio.run(limiter.check(_request()))

    assert decision == RateLimitDecision(allowed=False, retry_after_seconds=1)


def test_rate_limit_middleware_returns_structured_429() -> None:
    app = create_app(rate_limiter=BlockingLimiter())

    with TestClient(app) as client:
        response = client.post("/api/auth/microsoft")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "42"
    assert response.json() == {
        "detail": {
            "code": "RATE_LIMITED",
            "message": "Too many requests. Please retry later.",
            "retry_after_seconds": 42,
        }
    }
