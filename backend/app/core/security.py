from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    role: str | None
    email: str | None


@lru_cache
def _jwks_client() -> PyJWKClient:
    issuer = settings.supabase_jwt_issuer or f"{settings.supabase_url.rstrip('/')}/auth/v1"
    return PyJWKClient(f"{issuer}/.well-known/jwks.json")


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_access_token(token: str) -> CurrentUser:
    try:
        issuer = settings.supabase_jwt_issuer or f"{settings.supabase_url.rstrip('/')}/auth/v1"

        if settings.supabase_jwt_secret:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
                issuer=issuer,
            )
        else:
            key = _jwks_client().get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256", "ES256", "EdDSA"],
                audience=settings.supabase_jwt_audience,
                issuer=issuer,
            )

        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise _unauthorized()

        app_metadata = payload.get("app_metadata") or {}
        user_metadata = payload.get("user_metadata") or {}
        metadata = app_metadata if isinstance(app_metadata, dict) else user_metadata
        role = metadata.get("role") if isinstance(metadata, dict) else None

        return CurrentUser(
            id=user_id,
            role=role if isinstance(role, str) else None,
            email=payload.get("email") if isinstance(payload.get("email"), str) else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _unauthorized() from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    return verify_access_token(credentials.credentials)


async def get_customer(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    if current_user.role not in {None, "customer"}:
        raise HTTPException(status_code=403, detail="Customer access required.")
    return current_user


async def get_worker(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    if current_user.role not in {None, "worker"}:
        raise HTTPException(status_code=403, detail="Worker access required.")
    return current_user


async def get_admin(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    if current_user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user
