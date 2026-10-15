import pytest
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def db_engine():
    # Only run against the test environment to prevent accidents
    assert os.getenv("ENVIRONMENT") == "test", "Integration tests must run with ENVIRONMENT=test"
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        pytest.skip("DATABASE_URL not set for integration tests")

    engine = create_async_engine(db_url, echo=False)
    yield engine
    await engine.dispose()

@pytest.fixture
async def db_session(db_engine):
    async_session = sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        yield session
        await session.rollback() # Always rollback integration tests

@pytest.fixture
async def authenticated_session(db_session):
    """
    Simulates a Supabase authenticated session for Row Level Security (RLS)
    by setting the request.jwt.claims config on the transaction.
    """
    async def _authenticate(user_id: str, role: str = "authenticated"):
        # This is a postgres standard way to mock auth.uid() in tests
        await db_session.execute(
            f"SET LOCAL request.jwt.claims = '{{\"sub\": \"{user_id}\", \"role\": \"{role}\"}}';"
        )
        return db_session
    return _authenticate
