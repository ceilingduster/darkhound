from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.core.events.emitter import emit_event
from app.core.events.schema import (
    McpEnrichmentApplied,
    McpLookupCompleted,
    McpLookupFailed,
    McpLookupStarted,
)
from .enrichment import EnrichmentResult
from .providers.virustotal import VirusTotalProvider
from .providers.shodan import ShodanProvider
from .providers.abuseipdb import AbuseIPDBProvider

logger = logging.getLogger(__name__)


def _build_providers() -> list:
    providers = []
    if settings.virustotal_api_key:
        providers.append(VirusTotalProvider(
            api_key=settings.virustotal_api_key,
            base_url=settings.virustotal_mcp_url,
        ))
    if settings.shodan_api_key:
        providers.append(ShodanProvider(
            api_key=settings.shodan_api_key,
            base_url=settings.shodan_mcp_url,
        ))
    if settings.abuseipdb_api_key:
        providers.append(AbuseIPDBProvider(
            api_key=settings.abuseipdb_api_key,
            base_url=settings.abuseipdb_mcp_url,
        ))
    return providers


async def enrich_ioc(
    session_id: str,
    finding_id: str,
    ioc_type: str,
    ioc_value: str,
) -> list[EnrichmentResult]:
    """
    Run all configured providers in parallel for a single IOC.
    Emits MCP events for each lookup.
    """
    providers = _build_providers()
    if not providers:
        logger.warning("No MCP providers configured — skipping enrichment")
        return []

    tasks = []
    for provider in providers:
        tasks.append(
            _lookup_one(session_id, finding_id, ioc_type, ioc_value, provider)
        )

    results = await asyncio.gather(*tasks, return_exceptions=False)
    valid = [r for r in results if r is not None]

    if valid:
        summary = "; ".join(r.summary() for r in valid)
        await emit_event(
            McpEnrichmentApplied(
                session_id=session_id,
                finding_id=finding_id,
                enrichment_summary=summary,
            )
        )

    return valid


async def _lookup_one(
    session_id: str,
    finding_id: str,
    ioc_type: str,
    ioc_value: str,
    provider,
) -> EnrichmentResult | None:
    provider_name = type(provider).__name__.replace("Provider", "").lower()

    await emit_event(
        McpLookupStarted(
            session_id=session_id,
            finding_id=finding_id,
            provider=provider_name,
            ioc_type=ioc_type,
            ioc_value=ioc_value,
        )
    )

    try:
        result = await provider.lookup(ioc_type, ioc_value)

        if result.error:
            await emit_event(
                McpLookupFailed(
                    session_id=session_id,
                    finding_id=finding_id,
                    provider=provider_name,
                    error=result.error,
                )
            )
        else:
            await emit_event(
                McpLookupCompleted(
                    session_id=session_id,
                    finding_id=finding_id,
                    provider=provider_name,
                    result_summary=result.summary(),
                )
            )

        return result

    except Exception as exc:
        logger.error("MCP provider %s failed: %s", provider_name, exc)
        await emit_event(
            McpLookupFailed(
                session_id=session_id,
                finding_id=finding_id,
                provider=provider_name,
                error=str(exc),
            )
        )
        return None


async def enrich_finding(session_id: str, finding_id: str, indicators: list[dict]) -> None:
    """
    Enrich all indicators from a finding.
    Only enriches IP, domain, and hash IOC types.
    """
    supported_types = {"ip", "domain", "hash"}
    tasks = []

    for ioc in indicators:
        ioc_type = ioc.get("type", "")
        ioc_value = ioc.get("value", "")
        if ioc_type in supported_types and ioc_value:
            tasks.append(enrich_ioc(session_id, finding_id, ioc_type, ioc_value))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
