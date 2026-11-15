from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    database_url: str = ""
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
runtime_environment = os.environ.get("HABITLY_ENV", "development").lower()
if not settings.database_url:
    if runtime_environment == "production":
        raise RuntimeError("Production requires DATABASE_URL; filesystem SQLite is disabled.")
    from pathlib import Path
    settings.database_url = f"sqlite:///{Path(__file__).resolve().parents[1] / 'habitly.db'}"
if runtime_environment == "production" and settings.database_url.startswith("sqlite"):
    raise RuntimeError("Production requires PostgreSQL; SQLite is for local development only.")
if settings.database_url.startswith("postgres://"):
    settings.database_url = settings.database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif settings.database_url.startswith("postgresql://") and "+psycopg" not in settings.database_url:
    settings.database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
