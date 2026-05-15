from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    openai_api_key: str = "your_key_here"
    groq_api_key: Optional[str] = None
    mongodb_uri: str = "mongodb://localhost:27017/healthcare_ai"
    openai_model: str = "gpt-4o-mini"
    openai_timeout_seconds: float = 20.0
    vector_service_url: str = "http://vector-service:8001/search"
    env: str = "development"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
