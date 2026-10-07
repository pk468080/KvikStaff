import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_requires_cors_origins() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            database_url="postgresql+asyncpg://user:password@db:5432/kvikstaff",
            supabase_url="https://example.supabase.co",
            redis_url="redis://:password@redis:6379/0",
            cors_origins=[],
        )


def test_production_rejects_local_redis() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            database_url="postgresql+asyncpg://user:password@db:5432/kvikstaff",
            supabase_url="https://example.supabase.co",
            redis_url="redis://localhost:6379/0",
            cors_origins=["https://app.example.com"],
        )


def test_production_rejects_wildcard_cors() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            database_url="postgresql+asyncpg://user:password@db:5432/kvikstaff",
            supabase_url="https://example.supabase.co",
            redis_url="redis://:password@redis:6379/0",
            cors_origins=["*"],
        )


def test_production_accepts_required_configuration() -> None:
    settings = Settings(
        _env_file=None,
        environment="production",
        database_url="postgresql+asyncpg://user:password@db:5432/kvikstaff",
        supabase_url="https://example.supabase.co",
        redis_url="redis://:password@redis:6379/0",
        cors_origins=[
            "https://app.example.com",
            "https://worker.example.com",
            "https://admin.example.com",
        ],
    )

    assert settings.environment == "production"
    assert settings.debug is False
    assert settings.redis_url == "redis://:password@redis:6379/0"


def test_development_has_local_cors_origins() -> None:
    settings = Settings(
        _env_file=None,
        environment="development",
        database_url="postgresql+asyncpg://postgres:postgres@localhost/test",
        supabase_url="https://example.supabase.co",
    )

    assert "http://localhost:5173" in settings.cors_origins
    assert "http://localhost:8081" in settings.cors_origins


def test_development_default_settings() -> None:
    settings = Settings(_env_file=None, environment="development")
    assert settings.environment == "development"
    assert settings.database_url != ""
    assert settings.supabase_url != ""