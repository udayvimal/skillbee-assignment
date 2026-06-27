"""
Text-to-speech — edge-tts primary, gTTS fallback.

Microsoft's Edge TTS WebSocket returns 403 from cloud/datacenter IPs (Render).
When that happens we fall back to gTTS (Google Translate TTS) which works from
any IP, is free, and requires no API key.
Chain: edge-tts → gTTS → b"" (browser speech synthesis takes over on client)
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

_GTTS_LANGS = {
    "en": "en",
    "hi": "hi",
    "de": "de",
}

_RATE        = "+0%"
_PITCH       = "+0Hz"


async def _edge_tts(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=_RATE, pitch=_PITCH)
    buffer = BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])
    return buffer.getvalue()


async def _gtts_fallback(text: str, lang: str) -> bytes:
    """gTTS runs synchronously — offload to thread pool to keep async clean."""
    from gtts import gTTS  # imported here to avoid startup cost when edge-tts works
    loop = asyncio.get_event_loop()

    def _run() -> bytes:
        tts = gTTS(text=text, lang=lang, slow=False)
        buf = BytesIO()
        tts.write_to_fp(buf)
        return buf.getvalue()

    return await loop.run_in_executor(None, _run)


class TTSService:
    async def synthesize(self, text: str, language: str = "en") -> bytes:
        """
        Convert text to MP3 bytes.
        Returns b"" only if both edge-tts AND gTTS fail — client falls back
        to browser speech synthesis in that case.
        """
        if not text.strip():
            return b""

        voice    = _VOICES.get(language, _VOICES["en"])
        gtts_lang = _GTTS_LANGS.get(language, "en")

        # ── Primary: Microsoft Edge TTS ────────────────────────────────────
        try:
            audio = await _edge_tts(text, voice)
            if audio:
                logger.debug("TTS [edge-tts/%s]: %d bytes", voice, len(audio))
                return audio
        except Exception as exc:
            logger.warning("edge-tts failed (%s) — trying gTTS fallback", exc)

        # ── Fallback: Google Translate TTS ─────────────────────────────────
        try:
            audio = await _gtts_fallback(text, gtts_lang)
            if audio:
                logger.info("TTS [gTTS/%s]: %d bytes", gtts_lang, len(audio))
                return audio
        except Exception as exc:
            logger.error("gTTS fallback also failed (%s) — text-only mode", exc)

        return b""


tts_service = TTSService()
