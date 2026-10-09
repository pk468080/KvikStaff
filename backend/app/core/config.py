from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KvikStaff API"
    environment: str = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    log_level: str = "INFO"

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:8081",
        ]
    )

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/kvikstaff"
    )

    supabase_url: str = "https://example.supabase.co"
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_issuer: str | None = None
    supabase_jwt_secret: str | None = None

    redis_url: str = "redis://localhost:6379/0"

    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_production_config(self) -> "Settings":
        if self.environment != "production":
            return self

        if not self.database_url.strip():
            raise ValueError(
                "DATABASE_URL must be configured in production."
            )

        if not self.supabase_url.strip():
            raise ValueError(
                "SUPABASE_URL must be configured in production."
            )

        if not self.redis_url.strip():
            raise ValueError(
                "REDIS_URL must be configured in production."
            )

        if self.redis_url == "redis://localhost:6379/0":
            raise ValueError(
                "REDIS_URL must not use the local default in production."
            )

        if not self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must be configured in production."
            )

        if "*" in self.cors_origins:
            raise ValueError(
                "Wildcard CORS origins are not allowed in production."
            )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()