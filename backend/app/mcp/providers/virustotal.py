from __future__ import annotations

import logging

from app.mcp.client import McpHttpClient
from app.mcp.enrichment import EnrichmentResult

logger = logging.getLogger(__name__)


class VirusTotalProvider(McpHttpClient):
    """VirusTotal v3 API MCP provider."""

    def __init__(self, api_key: str, base_url: str = "https://www.virustotal.com/api/v3") -> None:
        super().__init__(base_url=base_url, api_key=api_key)

    def _headers(self) -> dict:
        return {"x-apikey": self.api_key}

    async def lookup(self, ioc_type: str, ioc_value: str) -> EnrichmentResult:
        try:
            if ioc_type == "ip":
                data = await self.get(f"/ip_addresses/{ioc_value}", headers=self._headers())
                return self._parse_ip(ioc_value, data)
            elif ioc_type == "domain":
                data = await self.get(f"/domains/{ioc_value}", headers=self._headers())
                return self._parse_domain(ioc_value, data)
            elif ioc_type == "hash":
                data = await self.get(f"/files/{ioc_value}", headers=self._headers())
                return self._parse_file(ioc_value, data)
            else:
                return EnrichmentResult(
                    provider="virustotal",
                    ioc_type=ioc_type,
                    ioc_value=ioc_value,
                    error=f"Unsupported IOC type: {ioc_type}",
                )
        except Exception as exc:
            logger.error("VirusTotal lookup failed for %s/%s: %s", ioc_type, ioc_value, exc)
            return EnrichmentResult(
                provider="virustotal",
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                error=str(exc),
            )

    def _parse_ip(self, ioc_value: str, data: dict) -> EnrichmentResult:
        attrs = data.get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        malicious_count = stats.get("malicious", 0)
        total = sum(stats.values()) or 1
        score = malicious_count / total

        return EnrichmentResult(
            provider="virustotal",
            ioc_type="ip",
            ioc_value=ioc_value,
            malicious=malicious_count > 0,
            score=score,
            country=attrs.get("country"),
            asn=str(attrs.get("asn", "")),
            isp=attrs.get("as_owner"),
            tags=list(attrs.get("tags", [])),
            raw=attrs,
        )

    def _parse_domain(self, ioc_value: str, data: dict) -> EnrichmentResult:
        attrs = data.get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        malicious_count = stats.get("malicious", 0)
        total = sum(stats.values()) or 1
        score = malicious_count / total

        return EnrichmentResult(
            provider="virustotal",
            ioc_type="domain",
            ioc_value=ioc_value,
            malicious=malicious_count > 0,
            score=score,
            tags=list(attrs.get("tags", [])),
            raw=attrs,
        )

    def _parse_file(self, ioc_value: str, data: dict) -> EnrichmentResult:
        attrs = data.get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        malicious_count = stats.get("malicious", 0)
        total = sum(stats.values()) or 1
        score = malicious_count / total

        return EnrichmentResult(
            provider="virustotal",
            ioc_type="hash",
            ioc_value=ioc_value,
            malicious=malicious_count > 0,
            score=score,
            tags=list(attrs.get("tags", [])),
            last_seen=str(attrs.get("last_analysis_date", "")),
            raw=attrs,
        )
