from typing import Any

from fastapi import HTTPException, status


def error_detail(code: str, message: str, **extra: Any) -> dict[str, Any]:
    detail: dict[str, Any] = {"code": code, "message": message}
    detail.update(extra)
    return detail


def app_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=error_detail(code, message))


def not_authenticated(message: str = "Not authenticated") -> HTTPException:
    return app_error(status.HTTP_401_UNAUTHORIZED, "NOT_AUTHENTICATED", message)
