from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 15.0


class McpHttpClient:
    """
    Base HTTP client for MCP providers.
    Subclasses implement lookup() with provider-specific logic.
    """

    def __init__(self, base_url: str, api_key: str, timeout: float = DEFAULT_TIMEOUT) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    async def get(self, path: str, params: dict | None = None, headers: dict | None = None) -> dict:
        url = f"{self.base_url}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, params=params, headers=headers or {})
            resp.raise_for_status()
            return resp.json()

    async def post(self, path: str, json: dict | None = None, headers: dict | None = None) -> dict:
        url = f"{self.base_url}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=json, headers=headers or {})
            resp.raise_for_status()
            return resp.json()

    async def lookup(self, ioc_type: str, ioc_value: str) -> dict:
        raise NotImplementedError
