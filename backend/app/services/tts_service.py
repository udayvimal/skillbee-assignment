"""
Text-to-speech via edge-tts (Microsoft Edge TTS, free).

Microsoft's TTS WebSocket endpoint occasionally returns 403 (rate-limited or
region-blocked). All synthesis errors are caught and return empty bytes so the
interview continues text-only rather than crashing the state machine.
"""

import asyncio
import logging
from io import BytesIO

import edge_tts

logger = logging.getLogger(__name__)

_VOICES = {
    "en": "en-US-AriaNeural",
    "hi": "hi-IN-SwaraNeural",
    "de": "de-DE-KatjaNeural",
}

_RATE        = "+0%"
_PITCH       = "+0Hz"
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0  # seconds between retries


class TTSService:
    async def synthesize(self, text: str, language: str = "en") -> bytes:
        """
        Convert text to MP3 bytes.

        Returns b"" on any error (403, network, etc.) so callers never need to
        handle TTS exceptions — the interview continues with text only.
        """
        if not text.strip():
            return b""

        voice = _VOICES.get(language, _VOICES["en"])
        logger.debug("TTS [%s/%s]: %.60s…", language, voice, text)

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                communicate = edge_tts.Communicate(
                    text=text, voice=voice, rate=_RATE, pitch=_PITCH
                )
                buffer = BytesIO()
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        buffer.write(chunk["data"])

                audio = buffer.getvalue()
                if audio:
                    logger.debug("TTS produced %d bytes (attempt %d)", len(audio), attempt)
                    return audio

                logger.warning("TTS returned 0 bytes (attempt %d/%d)", attempt, _MAX_RETRIES)

            except Exception as exc:
                logger.warning("TTS error (attempt %d/%d): %s", attempt, _MAX_RETRIES, exc)

            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_DELAY)

        logger.error("TTS failed after %d attempts — running text-only", _MAX_RETRIES)
        return b""


tts_service = TTSService()
