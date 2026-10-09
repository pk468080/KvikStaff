from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
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

    database_url: str

    supabase_url: str
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

    @field_validator("environment", mode="before")
    @classmethod
    def normalize_environment(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("ENVIRONMENT must be a string.")

        normalized = value.strip().lower()
        normalized = {
            "prod": "production",
            "dev": "development",
            "local": "development",
        }.get(normalized, normalized)

        allowed = {
            "development",
            "test",
            "staging",
            "production",
        }

        if normalized not in allowed:
            raise ValueError(
                "ENVIRONMENT must be development, test, staging, or production."
            )

        return normalized

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

        if self.redis_url.strip() == "redis://localhost:6379/0":
            raise ValueError(
                "REDIS_URL must not use the local default in production."
            )

        if not self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must be configured in production."
            )

        if any(origin.strip() == "*" for origin in self.cors_origins):
            raise ValueError(
                "Wildcard CORS origins are not allowed in production."
            )

        if self.debug:
            raise ValueError(
                "DEBUG must be false in production."
            )

        database_url = urlsplit(self.database_url.strip())
        database_host = (database_url.hostname or "").lower()

        if (
            not database_url.scheme.startswith("postgresql")
            or not database_host
        ):
            raise ValueError(
                "DATABASE_URL must be a valid PostgreSQL connection URL."
            )

        if database_host in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError(
                "DATABASE_URL must not use localhost in production."
            )

        supabase_url = urlsplit(self.supabase_url.strip())
        supabase_host = (supabase_url.hostname or "").lower()

        if (
            supabase_url.scheme != "https"
            or not supabase_host
            or supabase_url.path not in ("", "/")
            or supabase_url.query
            or supabase_url.fragment
        ):
            raise ValueError(
                "SUPABASE_URL must be a valid HTTPS project origin."
            )

        if (
            supabase_host in {
                "example.supabase.co",
                "localhost",
                "127.0.0.1",
                "::1",
            }
            or "your-project" in supabase_host
            or "placeholder" in supabase_host
        ):
            raise ValueError(
                "SUPABASE_URL must point to your real Supabase project."
            )

        redis_url = urlsplit(self.redis_url.strip())
        redis_host = (redis_url.hostname or "").lower()

        if redis_url.scheme not in {"redis", "rediss"} or not redis_host:
            raise ValueError(
                "REDIS_URL must use a valid redis:// or rediss:// URL."
            )

        if redis_host in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError(
                "REDIS_URL must not use localhost in production."
            )

        for origin in self.cors_origins:
            parsed_origin = urlsplit(origin.strip())

            if (
                parsed_origin.scheme != "https"
                or not parsed_origin.hostname
                or parsed_origin.username
                or parsed_origin.password
                or parsed_origin.path not in ("", "/")
                or parsed_origin.query
                or parsed_origin.fragment
                or parsed_origin.hostname.lower()
                in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError(
                    "Production CORS origins must be valid HTTPS origins without paths."
                )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
