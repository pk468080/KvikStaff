import json
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
async def db_engine():
    # Prevent accidental connections outside the explicit test environment.
    assert os.getenv("ENVIRONMENT") == "test", (
        "Integration tests must run with ENVIRONMENT=test"
    )

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set for integration tests")

    # A fresh engine per test avoids sharing async connections across loops.
    engine = create_async_engine(db_url, echo=False)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    async_session = sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        try:
            yield session
        finally:
            if session.in_transaction():
                await session.rollback()


@pytest.fixture
def authenticated_session(db_session):
    """Set JWT claims within the current database transaction."""

    async def _authenticate(
        user_id: str,
        role: str = "authenticated",
    ):
        claims = json.dumps({
            "sub": user_id,
            "role": role,
        })

        await db_session.execute(
            text("SELECT set_config('request.jwt.claims', :claims, true)"),
            {"claims": claims},
        )
        return db_session

    return _authenticate
