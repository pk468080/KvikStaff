import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_requires_cors_origins(monkeypatch) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            database_url="postgresql+asyncpg://postgres:postgres@localhost/test",
            supabase_url="https://example.supabase.co",
            cors_origins=[],
        )


def test_development_has_local_cors_origins() -> None:
    settings = Settings(
        environment="development",
        database_url="postgresql+asyncpg://postgres:postgres@localhost/test",
        supabase_url="https://example.supabase.co",
    )

    assert "http://localhost:5173" in settings.cors_origins
    assert "http://localhost:8081" in settings.cors_origins