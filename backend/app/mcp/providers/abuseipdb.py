from __future__ import annotations

import logging

from app.mcp.client import McpHttpClient
from app.mcp.enrichment import EnrichmentResult

logger = logging.getLogger(__name__)


class AbuseIPDBProvider(McpHttpClient):
    """AbuseIPDB API MCP provider."""

    def __init__(self, api_key: str, base_url: str = "https://api.abuseipdb.com/api/v2") -> None:
        super().__init__(base_url=base_url, api_key=api_key)

    def _headers(self) -> dict:
        return {
            "Key": self.api_key,
            "Accept": "application/json",
        }

    async def lookup(self, ioc_type: str, ioc_value: str) -> EnrichmentResult:
        if ioc_type != "ip":
            return EnrichmentResult(
                provider="abuseipdb",
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                error="AbuseIPDB only supports IP lookups",
            )

        try:
            data = await self.get(
                "/check",
                params={"ipAddress": ioc_value, "maxAgeInDays": 90, "verbose": True},
                headers=self._headers(),
            )
            return self._parse(ioc_value, data)
        except Exception as exc:
            logger.error("AbuseIPDB lookup failed for %s: %s", ioc_value, exc)
            return EnrichmentResult(
                provider="abuseipdb",
                ioc_type=ioc_type,
                ioc_value=ioc_value,
                error=str(exc),
            )

    def _parse(self, ioc_value: str, data: dict) -> EnrichmentResult:
        info = data.get("data", {})
        abuse_score = info.get("abuseConfidenceScore", 0)
        score = abuse_score / 100.0

        categories_map = {
            3: "Fraud Orders", 4: "DDoS Attack", 5: "FTP Brute-Force",
            6: "Ping of Death", 7: "Phishing", 8: "Fraud VoIP",
            9: "Open Proxy", 10: "Web Spam", 11: "Email Spam",
            12: "Blog Spam", 13: "VPN IP", 14: "Port Scan",
            15: "Hacking", 16: "SQL Injection", 17: "Spoofing",
            18: "Brute-Force", 19: "Bad Web Bot", 20: "Exploited Host",
            21: "Web App Attack", 22: "SSH", 23: "IoT Targeted",
        }

        categories = info.get("usageType", "") or ""
        report_categories = []
        for report in info.get("reports", [])[:5]:
            for cat_id in report.get("categories", []):
                label = categories_map.get(cat_id, str(cat_id))
                if label not in report_categories:
                    report_categories.append(label)

        return EnrichmentResult(
            provider="abuseipdb",
            ioc_type="ip",
            ioc_value=ioc_value,
            malicious=abuse_score >= 25,
            score=score,
            country=info.get("countryCode"),
            isp=info.get("isp"),
            tags=report_categories[:8],
            last_seen=info.get("lastReportedAt"),
            raw={
                "abuse_confidence_score": abuse_score,
                "total_reports": info.get("totalReports", 0),
                "distinct_users": info.get("numDistinctUsers", 0),
                "usage_type": categories,
                "is_tor": info.get("isTor", False),
                "is_public": info.get("isPublic", True),
            },
        )
