from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_ignore_empty=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Realtime Collab API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    # Only needed when the frontend and backend run on different origins
    # (split local dev). In production both sit behind the same domain.
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]


settings = Settings()
