from ipaddress import ip_address, ip_network
import logging
import time
from dataclasses import dataclass
from collections.abc import Callable
from typing import Protocol

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import Settings, settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    path_prefix: str
    limit: int
    window_seconds: int = 60
    methods: frozenset[str] | None = None

    def matches(self, request: Request) -> bool:
        if not request.url.path.startswith(self.path_prefix):
            return False
        return self.methods is None or request.method.upper() in self.methods


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int | None = None


class RateLimiter(Protocol):
    async def check(self, request: Request) -> RateLimitDecision: ...

    async def close(self) -> None: ...


class RedisRateLimiter:
    def __init__(
        self,
        redis: Redis,
        rules: tuple[RateLimitRule, ...],
        *,
        fail_open: bool,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.redis = redis
        self.rules = rules
        self.fail_open = fail_open
        self.clock = clock

    @classmethod
    def from_settings(cls, settings: Settings) -> "RedisRateLimiter | None":
        if not settings.rate_limit_enabled or not settings.redis_url:
            return None

        rules = (
            RateLimitRule(
                name="auth_google",
                path_prefix="/api/auth/google",
                limit=settings.rate_limit_auth_per_minute,
                methods=frozenset({"POST"}),
            ),
            RateLimitRule(
                name="auth_logout",
                path_prefix="/api/auth/logout",
                limit=settings.rate_limit_logout_per_minute,
                methods=frozenset({"POST"}),
            ),
            RateLimitRule(
                name="admin_write",
                path_prefix="/api/users",
                limit=settings.rate_limit_admin_write_per_minute,
                methods=frozenset({"PATCH"}),
            ),
            RateLimitRule(
                name="api_general",
                path_prefix="/api",
                limit=settings.rate_limit_api_per_minute,
            ),
        )
        redis = Redis.from_url(
            settings.redis_url, encoding="utf-8", decode_responses=True
        )
        return cls(redis, rules, fail_open=settings.rate_limit_fail_open)

    async def check(self, request: Request) -> RateLimitDecision:
        rule = self._matching_rule(request)
        if rule is None:
            return RateLimitDecision(allowed=True)

        client_ip = _client_ip(request)
        if client_ip is None:
            return RateLimitDecision(allowed=False, retry_after_seconds=1)

        key = self._key(rule, client_ip)
        try:
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, rule.window_seconds)
            if count <= rule.limit:
                return RateLimitDecision(allowed=True)

            ttl = await self.redis.ttl(key)
            return RateLimitDecision(
                allowed=False, retry_after_seconds=max(int(ttl), 1)
            )
        except RedisError:
            logger.warning("Redis rate limit check failed", exc_info=True)
            return RateLimitDecision(allowed=self.fail_open, retry_after_seconds=1)

    async def close(self) -> None:
        await self.redis.aclose()

    def _matching_rule(self, request: Request) -> RateLimitRule | None:
        return next((rule for rule in self.rules if rule.matches(request)), None)

    def _key(self, rule: RateLimitRule, client_ip: str) -> str:
        window = int(self.clock() // rule.window_seconds)
        return f"rate-limit:{rule.name}:{client_ip}:{window}"


def _client_ip(request: Request) -> str | None:
    if request.client:
        peer_ip = request.client.host
    else:
        return None

    trusted_proxies = _trusted_proxy_networks(settings.trusted_proxy_cidrs)
    if not trusted_proxies or not _ip_in_networks(peer_ip, trusted_proxies):
        return peer_ip

    forwarded_for = request.headers.get("x-forwarded-for", "")
    forwarded_ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
    for forwarded_ip in reversed(forwarded_ips):
        parsed_forwarded_ip = _parse_ip(forwarded_ip)
        if parsed_forwarded_ip is not None and not _ip_in_networks(
            parsed_forwarded_ip, trusted_proxies
        ):
            return forwarded_ip

    return peer_ip


def _trusted_proxy_networks(cidrs: list[str]):
    networks = []
    for cidr in cidrs:
        try:
            networks.append(ip_network(cidr, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid trusted proxy CIDR: %s", cidr)
    return tuple(networks)


def _parse_ip(ip: str):
    try:
        return ip_address(ip)
    except ValueError:
        return None


def _ip_in_networks(ip, networks) -> bool:
    parsed_ip = _parse_ip(ip) if isinstance(ip, str) else ip
    if parsed_ip is None:
        return False
    return any(parsed_ip in network for network in networks)
