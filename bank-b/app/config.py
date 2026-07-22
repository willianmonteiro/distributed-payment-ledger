from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str
    port: int = 8001
    rabbitmq_url: str = "amqp://localhost:5672"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
