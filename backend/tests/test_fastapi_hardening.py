import pytest
from pydantic import ValidationError
from app.core.config import Settings

def test_production_config_blocks_wildcard_cors():
    with pytest.raises(ValidationError, match="Wildcard CORS origins are not allowed in production"):
        Settings(
            environment="production",
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            supabase_url="https://example.supabase.co",
            redis_url="redis://remote.host:6379/0",
            cors_origins=["*"]
        )

def test_production_config_blocks_localhost_redis():
    with pytest.raises(ValidationError, match="REDIS_URL must not use the local default in production"):
        Settings(
            environment="production",
            database_url="postgresql+asyncpg://user:pass@localhost/db",
            supabase_url="https://example.supabase.co",
            redis_url="redis://localhost:6379/0",
            cors_origins=["https://production.com"]
        )

def test_production_config_requires_database_url():
    with pytest.raises(ValidationError, match="DATABASE_URL must be configured in production"):
        Settings(
            environment="production",
            database_url="   ",
            supabase_url="https://example.supabase.co",
            redis_url="redis://remote.host:6379/0",
            cors_origins=["https://production.com"]
        )
