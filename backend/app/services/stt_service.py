"""
Speech-to-text service using Groq Whisper.

Accepts raw audio bytes (webm/ogg/wav/mp3) and returns a transcript.
The language hint comes from the session's configured language.
"""

import logging
from io import BytesIO
from typing import Optional

from groq import AsyncGroq

from ..config import settings

logger = logging.getLogger(__name__)

# Map internal language codes to Whisper BCP-47 tags
_LANG_MAP = {"en": "en", "hi": "hi", "de": "de"}


class STTService:
    def __init__(self) -> None:
        self._client: Optional[AsyncGroq] = None

    @property
    def client(self) -> AsyncGroq:
        if self._client is None:
            self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        return self._client

    async def transcribe(
        self,
        audio_bytes: bytes,
        language: str = "en",
        filename: str = "audio.webm",
    ) -> str:
        """
        Transcribe audio bytes to text.

        Returns an empty string if the audio is silence or too short.
        """
        if len(audio_bytes) < 1000:
            logger.warning("Audio too short (%d bytes) — returning empty transcript", len(audio_bytes))
            return ""

        whisper_lang = _LANG_MAP.get(language, "en")
        audio_file = BytesIO(audio_bytes)
        audio_file.name = filename  # Groq SDK checks the extension for MIME type

        try:
            resp = await self.client.audio.transcriptions.create(
                file=audio_file,
                model=settings.GROQ_WHISPER_MODEL,
                language=whisper_lang,
                response_format="text",
            )
            text = (resp if isinstance(resp, str) else resp.text).strip()
            logger.info("Transcription (%s): %s", language, text[:100])
            return text
        except Exception as exc:
            logger.error("STT error: %s", exc)
            raise


stt_service = STTService()
