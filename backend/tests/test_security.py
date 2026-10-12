import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import security


class FakeResult:
    def __init__(self, profile: dict | None) -> None:
        self.profile = profile

    def mappings(self) -> "FakeResult":
        return self

    def first(self) -> dict | None:
        return self.profile


class FakeDB:
    def __init__(self, profile: dict | None) -> None:
        self.profile = profile

    async def execute(self, statement, params):
        return FakeResult(self.profile)


class FakeSessionContext:
    def __init__(self, db: FakeDB) -> None:
        self.db = db

    async def __aenter__(self) -> FakeDB:
        return self.db

    async def __aexit__(
        self,
        exc_type,
        exc_value,
        traceback,
    ) -> None:
        return None


def credentials() -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="test-token",
    )


def patch_auth_db(
    monkeypatch,
    profile: dict | None,
) -> None:
    fake_db = FakeDB(profile)

    def fake_session_local():
        return FakeSessionContext(fake_db)

    monkeypatch.setattr(
        security,
        "AsyncSessionLocal",
        fake_session_local,
    )


@pytest.mark.asyncio
async def test_customer_access_uses_database_role(monkeypatch) -> None:
    async def fake_verify_access_token(
        token: str,
    ) -> security.CurrentUser:
        return security.CurrentUser(
            id="11111111-1111-1111-1111-111111111111",
            role="worker",
            email="customer@example.com",
        )

    monkeypatch.setattr(
        security,
        "verify_access_token",
        fake_verify_access_token,
    )

    patch_auth_db(
        monkeypatch,
        {
            "role": "customer",
            "is_active": True,
        },
    )

    user = await security.get_current_user(
        credentials(),
    )

    assert user.role == "customer"

    authorized = await security.get_customer(
        user,
    )

    assert authorized is user


@pytest.mark.asyncio
async def test_worker_access_uses_database_role(monkeypatch) -> None:
    async def fake_verify_access_token(
        token: str,
    ) -> security.CurrentUser:
        return security.CurrentUser(
            id="22222222-2222-2222-2222-222222222222",
            role=None,
            email="worker@example.com",
        )

    monkeypatch.setattr(
        security,
        "verify_access_token",
        fake_verify_access_token,
    )

    patch_auth_db(
        monkeypatch,
        {
            "role": "worker",
            "is_active": True,
        },
    )

    user = await security.get_current_user(
        credentials(),
    )

    assert user.role == "worker"

    authorized = await security.get_worker(
        user,
    )

    assert authorized is user


@pytest.mark.asyncio
async def test_inactive_profile_is_rejected(
    monkeypatch,
) -> None:
    async def fake_verify_access_token(
        token: str,
    ) -> security.CurrentUser:
        return security.CurrentUser(
            id="33333333-3333-3333-3333-333333333333",
            role="customer",
            email="inactive@example.com",
        )

    monkeypatch.setattr(
        security,
        "verify_access_token",
        fake_verify_access_token,
    )

    patch_auth_db(
        monkeypatch,
        {
            "role": "customer",
            "is_active": False,
        },
    )

    with pytest.raises(
        HTTPException,
    ) as exc_info:
        await security.get_current_user(
            credentials(),
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "Account is inactive."
    )


@pytest.mark.asyncio
async def test_missing_profile_is_rejected(
    monkeypatch,
) -> None:
    async def fake_verify_access_token(
        token: str,
    ) -> security.CurrentUser:
        return security.CurrentUser(
            id="44444444-4444-4444-4444-444444444444",
            role="customer",
            email="missing@example.com",
        )

    monkeypatch.setattr(
        security,
        "verify_access_token",
        fake_verify_access_token,
    )

    patch_auth_db(
        monkeypatch,
        None,
    )

    with pytest.raises(
        HTTPException,
    ) as exc_info:
        await security.get_current_user(
            credentials(),
        )

    assert exc_info.value.status_code == 403
    assert (
        exc_info.value.detail
        == "Account profile not found."
    )