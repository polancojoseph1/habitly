from pydantic_settings import BaseSettings, SettingsConfigDict
import os


class Settings(BaseSettings):
    database_url: str = ""
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
if not settings.database_url:
    if os.environ.get("REPL_ID"):
        raise RuntimeError("Replit requires its managed PostgreSQL DATABASE_URL; filesystem SQLite is disabled.")
    from pathlib import Path
    settings.database_url = f"sqlite:///{Path(__file__).resolve().parents[1] / 'habitly.db'}"
if settings.database_url.startswith("postgres://"):
    settings.database_url = settings.database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif settings.database_url.startswith("postgresql://") and "+psycopg" not in settings.database_url:
    settings.database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
