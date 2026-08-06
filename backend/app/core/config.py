from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./repo_hub.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "development-only-change-me"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/v1/auth/github/callback"
    frontend_url: str = "http://localhost:5173"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"


@lru_cache
def get_settings() -> Settings:
    return Settings()
