from pydantic_settings import BaseSettings
from pathlib import Path
from typing import List, Literal

# app/  (contains config.py, data/, services/, etc.)
APP_DIR = Path(__file__).parent
# backend/data/  — writable storage for DB and generated caches
DATA_DIR = APP_DIR / "data"


class Settings(BaseSettings):
    # API Keys
    GROQ_API_KEY: str

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://*.vercel.app",
    ]

    # Database (stored alongside the dataset in app/data/)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DATA_DIR}/interview.db"

    # Groq Models
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.1-8b-instant"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"

    # Embeddings & Retrieval (cached alongside qa_dataset.json)
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    FAISS_INDEX_PATH: str = str(DATA_DIR / "faiss.index")
    EMBEDDINGS_CACHE_PATH: str = str(DATA_DIR / "embeddings_cache.npz")
    QA_DATASET_PATH: str = str(DATA_DIR / "qa_dataset.json")

    # TTS
    DEFAULT_LANGUAGE: Literal["en", "hi", "de"] = "en"
    TTS_VOICES: dict = {
        "en": "en-US-AriaNeural",
        "hi": "hi-IN-SwaraNeural",
        "de": "de-DE-KatjaNeural",
    }

    # Interview
    DEFAULT_QUESTION_COUNT: int = 8
    MAX_QUESTION_COUNT: int = 15
    # 3-tier follow-up logic (matches assignment exactly):
    #   score >= SCORE_NEXT_QUESTION  → next question
    #   score >= SCORE_FOLLOW_UP      → one follow-up question
    #   score <  SCORE_FOLLOW_UP      → teach + reveal ideal answer + move on
    SCORE_NEXT_QUESTION: float = 8.0
    SCORE_FOLLOW_UP: float = 5.0
    MAX_ANSWER_DURATION_SECONDS: int = 120
    AUTO_ADVANCE_SECONDS: int = 30  # seconds of silence before auto-skip

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore",  # ignore removed keys like FOLLOW_UP_SCORE_THRESHOLD
    }


settings = Settings()
