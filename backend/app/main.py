import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import error_detail
from app.rate_limit import RateLimiter, RedisRateLimiter
from app.routers import auth, dashboard, health, users

logger = logging.getLogger(__name__)


def create_app(rate_limiter: RateLimiter | None = None) -> FastAPI:
    limiter = rate_limiter or RedisRateLimiter.from_settings(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        if limiter:
            await limiter.close()

    app = FastAPI(
        title="OAuth OIDC Demo API",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.state.rate_limiter = limiter

    if limiter:

        @app.middleware("http")
        async def rate_limit_middleware(request: Request, call_next):
            decision = await limiter.check(request)
            if not decision.allowed:
                retry_after = decision.retry_after_seconds or 1
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "detail": error_detail(
                            "RATE_LIMITED",
                            "Too many requests. Please retry later.",
                            retry_after_seconds=retry_after,
                        )
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            return await call_next(request)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(dashboard.router)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": error_detail(
                    "VALIDATION_ERROR", "Request validation failed", errors=exc.errors()
                )
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception(
            "Unhandled exception for %s %s", request.method, request.url.path
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": error_detail("INTERNAL_ERROR", "Internal server error")},
        )

    return app


app = create_app()
