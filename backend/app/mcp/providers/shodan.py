from __future__ import annotations

import logging

from app.mcp.client import McpHttpClient
from app.mcp.enrichment import EnrichmentResult

logger = logging.getLogger(__name__)


class ShodanProvider(McpHttpClient):
    """Shodan API MCP provider."""

    def __init__(self, api_key: str, base_url: str = "https://api.shodan.io") -> None:
        super().__init__(base_url=base_url, api_key=api_key)

    async def lookup(self, ioc_type: str, ioc_value: str) -> EnrichmentResult:
        if ioc_type != "ip":
            return EnrichmentResult(
                provider="shodan",
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                error="Shodan only supports IP lookups",
            )

        try:
            data = await self.get(
                f"/shodan/host/{ioc_value}",
                params={"key": self.api_key},
            )
            return self._parse(ioc_value, data)
        except Exception as exc:
            logger.error("Shodan lookup failed for %s: %s", ioc_value, exc)
            return EnrichmentResult(
                provider="shodan",
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                error=str(exc),
            )

    def _parse(self, ioc_value: str, data: dict) -> EnrichmentResult:
        ports = data.get("ports", [])
        vulns = list(data.get("vulns", {}).keys())
        tags = data.get("tags", []) + ([f"CVE:{v}" for v in vulns[:5]])

        return EnrichmentResult(
            provider="shodan",
            ioc_type="ip",
            ioc_value=ioc_value,
            malicious=len(vulns) > 0,
            score=min(1.0, len(vulns) * 0.1),
            country=data.get("country_code"),
            asn=data.get("asn"),
            isp=data.get("isp"),
            tags=tags,
            last_seen=data.get("last_update"),
            raw={
                "ports": ports,
                "vulns": vulns,
                "hostnames": data.get("hostnames", []),
                "os": data.get("os"),
                "org": data.get("org"),
            },
        )
