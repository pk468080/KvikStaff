from dataclasses import dataclass
from time import monotonic

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


bearer_scheme = HTTPBearer(auto_error=False)

JWKS_CACHE_TTL_SECONDS = 600

SUPPORTED_ASYMMETRIC_ALGORITHMS = {
    "ES256",
    "RS256",
    "EdDSA",
}

_jwks_cache: dict[
    str,
    tuple[float, dict[str, dict]],
] = {}


@dataclass(frozen=True)
class CurrentUser:
    id: str
    role: str | None
    email: str | None


def _issuer() -> str:
    return (
        settings.supabase_jwt_issuer
        or f"{settings.supabase_url.rstrip('/')}/auth/v1"
    )


def _jwks_url() -> str:
    return f"{_issuer()}/.well-known/jwks.json"


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication token.",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )


async def _fetch_jwks(
    force_refresh: bool = False,
) -> dict[str, dict]:
    issuer = _issuer()
    now = monotonic()

    cached = _jwks_cache.get(issuer)

    if (
        not force_refresh
        and cached is not None
        and now - cached[0] < JWKS_CACHE_TTL_SECONDS
    ):
        return cached[1]

    async with httpx.AsyncClient(
        timeout=10,
    ) as client:
        response = await client.get(
            _jwks_url(),
        )

        response.raise_for_status()

        payload = response.json()

    keys = payload.get("keys")

    if not isinstance(keys, list):
        raise TypeError(
            "Supabase JWKS response does not contain a valid keys list."
        )

    indexed_keys: dict[str, dict] = {}

    for key in keys:
        if not isinstance(key, dict):
            continue

        kid = key.get("kid")

        if isinstance(kid, str) and kid:
            indexed_keys[kid] = key

    if not indexed_keys:
        raise ValueError(
            "Supabase JWKS response does not contain usable signing keys."
        )

    _jwks_cache[issuer] = (
        now,
        indexed_keys,
    )

    return indexed_keys


async def verify_access_token(
    token: str,
) -> CurrentUser:
    try:
        issuer = _issuer()

        if settings.supabase_jwt_secret:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=[
                    "HS256",
                ],
                audience=settings.supabase_jwt_audience,
                issuer=issuer,
            )

        else:
            header = jwt.get_unverified_header(
                token,
            )

            algorithm = header.get("alg")
            kid = header.get("kid")

            if (
                algorithm
                not in SUPPORTED_ASYMMETRIC_ALGORITHMS
            ):
                raise _unauthorized()

            if not isinstance(kid, str) or not kid:
                raise _unauthorized()

            jwks = await _fetch_jwks()

            key_data = jwks.get(kid)

            if key_data is None:
                jwks = await _fetch_jwks(
                    force_refresh=True,
                )

                key_data = jwks.get(kid)

            if key_data is None:
                raise _unauthorized()

            jwk_algorithm = key_data.get("alg")

            if (
                isinstance(
                    jwk_algorithm,
                    str,
                )
                and jwk_algorithm != algorithm
            ):
                raise _unauthorized()

            signing_key = jwt.PyJWK.from_dict(
                key_data,
                algorithm=algorithm,
            ).key

            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[
                    algorithm,
                ],
                audience=settings.supabase_jwt_audience,
                issuer=issuer,
            )

        user_id = payload.get("sub")

        if not isinstance(user_id, str) or not user_id:
            raise _unauthorized()

        app_metadata = (
            payload.get("app_metadata")
            or {}
        )

        role = (
            app_metadata.get("role")
            if isinstance(
                app_metadata,
                dict,
            )
            else None
        )

        return CurrentUser(
            id=user_id,
            role=(
                role
                if isinstance(
                    role,
                    str,
                )
                else None
            ),
            email=(
                payload.get("email")
                if isinstance(
                    payload.get("email"),
                    str,
                )
                else None
            ),
        )

    except HTTPException:
        raise

    except Exception as exc:
        raise _unauthorized() from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme,
    ),
) -> CurrentUser:
    """
    Authenticate the request and validate the application profile.

    Authentication/profile lookup deliberately uses a dedicated database
    session so it does not start a transaction on the session owned by the
    actual API route.
    """
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
    ):
        raise _unauthorized()

    token_user = await verify_access_token(
        credentials.credentials,
    )

    async with AsyncSessionLocal() as auth_db:
        result = await auth_db.execute(
            text(
                """
                SELECT
                    role,
                    is_active
                FROM public.profiles
                WHERE id = CAST(:user_id AS uuid)
                LIMIT 1
                """
            ),
            {
                "user_id": token_user.id,
            },
        )

        profile = result.mappings().first()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account profile not found.",
        )

    if profile["is_active"] is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    role = profile["role"]

    if not isinstance(
        role,
        str,
    ) or not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account role is not configured.",
        )

    return CurrentUser(
        id=token_user.id,
        role=role,
        email=token_user.email,
    )


async def get_customer(
    current_user: CurrentUser = Depends(
        get_current_user,
    ),
) -> CurrentUser:
    if current_user.role != "customer":
        raise HTTPException(
            status_code=403,
            detail="Customer access required.",
        )

    return current_user


async def get_worker(
    current_user: CurrentUser = Depends(
        get_current_user,
    ),
) -> CurrentUser:
    if current_user.role != "worker":
        raise HTTPException(
            status_code=403,
            detail="Worker access required.",
        )

    return current_user


async def get_admin(
    current_user: CurrentUser = Depends(
        get_current_user,
    ),
) -> CurrentUser:
    if current_user.role not in {
        "admin",
        "super_admin",
    }:
        raise HTTPException(
            status_code=403,
            detail="Admin access required.",
        )

    return current_user