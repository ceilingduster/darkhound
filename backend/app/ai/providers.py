from __future__ import annotations

import abc
import logging
from collections.abc import AsyncIterator

import anthropic
import openai

from app.config import settings

logger = logging.getLogger(__name__)


class AiProvider(abc.ABC):
    """Minimal interface every AI backend must implement."""

    @abc.abstractmethod
    async def stream_completion(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 8192,
    ) -> AsyncIterator[str]:
        """Yield text chunks from the model."""
        ...  # pragma: no cover


class AnthropicProvider(AiProvider):
    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model

    async def stream_completion(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 8192,
    ) -> AsyncIterator[str]:
        async with self._client.messages.stream(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            async for chunk in stream.text_stream:
                yield chunk


class OpenAIProvider(AiProvider):
    def __init__(self) -> None:
        kwargs: dict = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url
        self._client = openai.AsyncOpenAI(**kwargs)
        self._model = settings.openai_model

    async def stream_completion(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 8192,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            stream=True,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content


class OllamaProvider(AiProvider):
    """OpenAI-compatible client pointed at Ollama's /v1 endpoint."""

    def __init__(self) -> None:
        base_url = settings.ollama_host.rstrip("/") + "/v1"
        self._client = openai.AsyncOpenAI(api_key="ollama", base_url=base_url)
        self._model = settings.ollama_model

    async def stream_completion(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 8192,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            stream=True,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content


_PROVIDERS: dict[str, type[AiProvider]] = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "ollama": OllamaProvider,
}


def get_provider() -> AiProvider:
    """Return an AiProvider instance based on ``settings.ai_provider``."""
    name = settings.ai_provider.lower()
    cls = _PROVIDERS.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown AI provider '{name}'. Choose from: {', '.join(_PROVIDERS)}"
        )
    return cls()


def is_retryable(exc: Exception) -> bool:
    """Return True when the error is transient and worth retrying."""
    if isinstance(exc, anthropic.APIError):
        return isinstance(exc, (anthropic.RateLimitError, anthropic.InternalServerError))
    if isinstance(exc, openai.APIError):
        return isinstance(exc, (openai.RateLimitError, openai.InternalServerError))
    return False
