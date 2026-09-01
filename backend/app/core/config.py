from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_name: str = "Nuthrick API"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    supabase_url: Optional[str] = None
    supabase_publishable_key: Optional[str] = None
    supabase_secret_key: Optional[str] = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
