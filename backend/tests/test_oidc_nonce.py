import asyncio

import pytest
from redis.exceptions import RedisError

from app.auth import oidc_nonce


class FakeRedis:
    def __init__(self, getdel_value: str | None = "1", fail: bool = False):
        self.getdel_value = getdel_value
        self.fail = fail
        self.closed = False
        self.set_calls: list[tuple[str, str, int, bool]] = []
        self.getdel_calls: list[str] = []

    async def set(self, key: str, value: str, ex: int, nx: bool):
        if self.fail:
            raise RedisError("down")
        self.set_calls.append((key, value, ex, nx))
        return True

    async def execute_command(self, command: str, key: str):
        if self.fail:
            raise RedisError("down")
        assert command == "GETDEL"
        self.getdel_calls.append(key)
        return self.getdel_value

    async def aclose(self) -> None:
        self.closed = True


def test_issue_oidc_nonce_stores_random_nonce_with_ttl(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oidc_nonce, "get_oidc_nonce_redis", lambda: redis)
    monkeypatch.setattr(oidc_nonce.secrets, "token_urlsafe", lambda length: "nonce-123")

    nonce = asyncio.run(oidc_nonce.issue_oidc_nonce())

    assert nonce == "nonce-123"
    assert redis.set_calls == [
        ("oidc_nonce:nonce-123", "1", oidc_nonce.NONCE_TTL_SECONDS, True)
    ]
    assert redis.closed is True


def test_consume_oidc_nonce_deletes_nonce_atomically(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oidc_nonce, "get_oidc_nonce_redis", lambda: redis)

    asyncio.run(oidc_nonce.consume_oidc_nonce("nonce-123"))

    assert redis.getdel_calls == ["oidc_nonce:nonce-123"]
    assert redis.closed is True


def test_consume_oidc_nonce_rejects_absent_nonce(monkeypatch):
    redis = FakeRedis(getdel_value=None)
    monkeypatch.setattr(oidc_nonce, "get_oidc_nonce_redis", lambda: redis)

    with pytest.raises(oidc_nonce.OidcNonceError, match="invalid or expired"):
        asyncio.run(oidc_nonce.consume_oidc_nonce("nonce-123"))


def test_oidc_nonce_helpers_fail_closed_without_redis(monkeypatch):
    monkeypatch.setattr(oidc_nonce, "get_oidc_nonce_redis", lambda: None)

    with pytest.raises(oidc_nonce.OidcNonceError):
        asyncio.run(oidc_nonce.issue_oidc_nonce())

    with pytest.raises(oidc_nonce.OidcNonceError):
        asyncio.run(oidc_nonce.consume_oidc_nonce("nonce-123"))
