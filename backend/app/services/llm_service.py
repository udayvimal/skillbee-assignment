"""
LLM service wrapping the Groq API.

Uses llama-3.3-70b-versatile for evaluation/summary (quality)
and llama3-8b-8192 for quick conversational responses (speed).
Includes retry logic with exponential backoff.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from groq import AsyncGroq

from ..config import settings

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self) -> None:
        self._client: Optional[AsyncGroq] = None

    @property
    def client(self) -> AsyncGroq:
        if self._client is None:
            self._client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        return self._client

    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        response_format: Optional[Dict[str, Any]] = None,
        max_retries: int = 3,
    ) -> str:
        """Send a chat completion request with automatic retries."""
        model = model or settings.GROQ_MODEL
        last_error: Optional[Exception] = None

        for attempt in range(max_retries):
            try:
                kwargs: Dict[str, Any] = dict(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                if response_format:
                    kwargs["response_format"] = response_format

                resp = await self.client.chat.completions.create(**kwargs)
                return resp.choices[0].message.content or ""

            except Exception as exc:
                last_error = exc
                wait = 2 ** attempt
                logger.warning("LLM attempt %d/%d failed: %s — retrying in %ds", attempt + 1, max_retries, exc, wait)
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait)

        raise RuntimeError(f"LLM call failed after {max_retries} attempts: {last_error}") from last_error

    async def chat_fast(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.5,
        max_tokens: int = 512,
    ) -> str:
        """Use the smaller, faster model for low-stakes conversational turns."""
        return await self.chat(
            messages=messages,
            model=settings.GROQ_FAST_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
        )


llm_service = LLMService()
