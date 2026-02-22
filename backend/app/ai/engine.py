from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.events.emitter import emit_event
from app.core.events.schema import (
    AiError,
    AiFindingGenerated,
    AiReasoningChunk,
    AiReasoningCompleted,
    AiReasoningStarted,
    AiRemediationReady,
)
from app.core.session.manager import session_manager
from .confidence import normalize_confidence, severity_to_confidence_floor
from .providers import get_provider, is_retryable
from .reasoning import ReasoningAssembler, extract_findings_from_markdown
from .schema import AiAnalysisResult, AiFinding

logger = logging.getLogger(__name__)

MAX_TOKENS = 16384
MAX_AI_RESPONSE_LENGTH = 65536  # 64KB — discard responses exceeding this
CHUNK_BATCH_INTERVAL = 0.15  # seconds — batch AI chunks to reduce WebSocket spam


def _build_system_prompt() -> str:
    return """You are an expert threat hunter and incident responder analyzing SSH command output from a Linux host.

Your task:
1. Analyze the provided command outputs for signs of compromise, persistence, lateral movement, or other threats
2. Identify specific indicators of compromise (IoCs)
3. Produce a clear, readable Markdown executive report
4. Provide actionable remediation steps

FORMAT YOUR ENTIRE RESPONSE AS A MARKDOWN DOCUMENT with the following structure:

# Executive Summary
Brief overview of the analysis results, overall risk level, and key takeaways.

## Risk Assessment
State the overall risk level (Critical / High / Medium / Low / Info) and justify it.

## Key Findings
For EACH finding, create a subsection:

### [Finding Title]
- **Severity**: critical|high|medium|low|info
- **Confidence**: percentage
- **MITRE ATT&CK**: technique IDs (e.g. T1053.005)
- **Description**: Detailed description of the finding
- **Indicators**: List specific IoCs found (IPs, domains, hashes, file paths, users, processes)
- **Evidence**: Relevant output snippets in code blocks
- **Remediation**: Actionable steps to address the finding

## Remediation Summary
Prioritized list of actions to take.

---

After your Markdown report, append a structured JSON block for machine parsing. Wrap it in ```json``` fences:

```json
{
  "summary": "Brief executive summary",
  "overall_risk": "critical|high|medium|low|info",
  "findings": [
    {
      "title": "Short descriptive title",
      "severity": "critical|high|medium|low|info",
      "confidence": 0.0-1.0,
      "description": "Detailed description of the finding",
      "technique_ids": ["T1053.005"],
      "indicators": [
        {"type": "ip|domain|hash|file_path|user|process", "value": "...", "context": "..."}
      ],
      "remediation_steps": ["Step 1...", "Step 2..."],
      "raw_evidence": "Relevant output snippet"
    }
  ]
}
```

If nothing suspicious is found, state that clearly in the report and return an empty findings array with overall_risk "info"."""


def _build_user_prompt(module_name: str, observations: list[dict]) -> str:
    parts = [f"# Hunt Module: {module_name}\n"]

    for obs in observations:
        parts.append(f"\n## Step: {obs.get('step_id', 'unknown')}")
        parts.append(f"**Command**: `{obs.get('command', '')}`")
        parts.append(f"**Exit Code**: {obs.get('exit_code', 'N/A')}")

        if obs.get("error"):
            parts.append(f"**Error**: {obs['error']}")
            continue

        if obs.get("stdout"):
            stdout = obs["stdout"][:3000]  # Limit per step
            parts.append(f"**stdout**:\n```\n{stdout}\n```")

        if obs.get("stderr"):
            stderr = obs["stderr"][:500]
            parts.append(f"**stderr**:\n```\n{stderr}\n```")

    return "\n".join(parts)


async def analyze_hunt_results(
    session_id: str,
    hunt_id: str,
    module,
    observations: list[dict],
    db: AsyncSession,
) -> int:
    """
    Stream Claude analysis of hunt observations.
    Persists findings to DB.
    Returns count of findings generated.
    """
    ctx = session_manager.get(session_id)
    if ctx is None:
        raise RuntimeError(f"Session {session_id} not found")

    async with ctx.ai_lock:
        return await _run_analysis(session_id, hunt_id, module, observations, db)


async def _run_analysis(
    session_id: str,
    hunt_id: str,
    module,
    observations: list[dict],
    db: AsyncSession,
) -> int:
    provider = get_provider()
    assembler = ReasoningAssembler()

    await emit_event(
        AiReasoningStarted(
            session_id=session_id,
            hunt_id=hunt_id,
            context_summary=f"Analyzing {len(observations)} observations from {module.name}",
        )
    )

    full_text = ""
    try:
        chunk_buffer: list[str] = []
        last_flush = time.monotonic()
        current_state = "analyzing"

        async for chunk in provider.stream_completion(
            system_prompt=_build_system_prompt(),
            user_message=_build_user_prompt(module.name, observations),
            max_tokens=MAX_TOKENS,
        ):
            state = assembler.add_chunk(chunk)
            full_text += chunk
            chunk_buffer.append(chunk)
            current_state = state.value

            # Batch chunks: flush every CHUNK_BATCH_INTERVAL seconds
            now = time.monotonic()
            if now - last_flush >= CHUNK_BATCH_INTERVAL:
                batched = "".join(chunk_buffer)
                chunk_buffer.clear()
                last_flush = now
                await emit_event(
                    AiReasoningChunk(
                        session_id=session_id,
                        hunt_id=hunt_id,
                        chunk=batched,
                        state=current_state,
                    )
                )

        # Flush remaining buffered chunks
        if chunk_buffer:
            batched = "".join(chunk_buffer)
            chunk_buffer.clear()
            await emit_event(
                AiReasoningChunk(
                    session_id=session_id,
                    hunt_id=hunt_id,
                    chunk=batched,
                    state=current_state,
                )
            )

    except Exception as exc:
        await emit_event(
            AiError(session_id=session_id, error=str(exc), retryable=is_retryable(exc))
        )
        raise

    # Guard: discard excessively long responses
    if len(full_text) > MAX_AI_RESPONSE_LENGTH:
        logger.warning("AI response too long (%d bytes) for hunt %s — truncating", len(full_text), hunt_id)
        full_text = full_text[:MAX_AI_RESPONSE_LENGTH]

    summary = assembler.assembled_text[:500]
    await emit_event(
        AiReasoningCompleted(session_id=session_id, hunt_id=hunt_id, summary=summary)
    )

    # Persist the full AI report text on the hunt execution row
    # Use a dedicated DB session so the commit is independent of the
    # orchestrator's transaction — prevents silent loss of the report.
    try:
        from sqlalchemy import update as sa_update
        from app.core.db.engine import AsyncSessionLocal
        from app.core.db.models import HuntExecution
        async with AsyncSessionLocal() as report_db:
            await report_db.execute(
                sa_update(HuntExecution)
                .where(HuntExecution.id == uuid.UUID(hunt_id))
                .values(ai_report_text=full_text)
            )
            await report_db.commit()
            logger.info("Persisted AI report text (%d bytes) for hunt %s", len(full_text), hunt_id)
    except Exception as exc:
        logger.warning("Failed to persist AI report text for hunt %s: %s", hunt_id, exc)

    # Parse structured output — try JSON first, then fall back to markdown
    result: AiAnalysisResult | None = None
    json_block = assembler.extract_json_block()

    if json_block:
        try:
            raw = json.loads(json_block)
            result = AiAnalysisResult.model_validate(raw)
            logger.info("Parsed %d findings from JSON block for hunt %s", len(result.findings), hunt_id)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning(
                "Failed to parse AI structured JSON for hunt %s: %s — block (last 200 chars): …%s",
                hunt_id, exc, json_block[-200:],
            )
    else:
        logger.warning(
            "No JSON block found in AI response for hunt %s — tail: …%s",
            hunt_id, full_text[-200:],
        )

    # Markdown fallback when JSON extraction failed or produced no findings
    if result is None or not result.findings:
        md_findings = extract_findings_from_markdown(full_text)
        if md_findings:
            logger.info(
                "Markdown fallback extracted %d findings for hunt %s", len(md_findings), hunt_id,
            )
            result = AiAnalysisResult(
                summary=summary,
                findings=[AiFinding.model_validate(f) for f in md_findings],
                overall_risk=md_findings[0].get("severity", "medium") if md_findings else "info",
            )
        else:
            logger.warning("Markdown fallback found no findings for hunt %s", hunt_id)
            return 0

    # Persist findings
    findings_count = 0
    asset_id = session_manager.get(session_id).asset_id if session_manager.get(session_id) else None

    for ai_finding in result.findings:
        finding_id = await _persist_finding(
            session_id=session_id,
            hunt_id=hunt_id,
            asset_id=asset_id,
            ai_finding=ai_finding,
            db=db,
        )
        if finding_id:
            findings_count += 1
            await emit_event(
                AiFindingGenerated(
                    session_id=session_id,
                    hunt_id=hunt_id,
                    finding_id=finding_id,
                    severity=ai_finding.severity,
                    title=ai_finding.title,
                )
            )

            # Record timeline event for finding
            if asset_id:
                try:
                    from app.intelligence.timeline.recorder import record_timeline_event
                    ctx = session_manager.get(session_id)
                    analyst_id = ctx.analyst_id if ctx else "system"
                    await record_timeline_event(
                        asset_id=asset_id,
                        event_type="finding.generated",
                        analyst_id=analyst_id,
                        payload={
                            "finding_id": finding_id,
                            "title": ai_finding.title,
                            "severity": ai_finding.severity,
                        },
                        session_id=session_id,
                        db=db,
                    )
                except Exception as tl_exc:
                    logger.warning("Timeline record failed for finding: %s", tl_exc)

    return findings_count


async def _persist_finding(
    session_id: str,
    hunt_id: str,
    asset_id: str | None,
    ai_finding: AiFinding,
    db: AsyncSession,
) -> str | None:
    from app.intelligence.stix.builder import build_stix_bundle
    from app.intelligence.stix.validator import validate_bundle
    from app.intelligence.timeline.deduplicator import upsert_finding
    from app.intelligence.remediation.engine import structure_remediation
    from app.core.events.schema import AiStixGenerated

    # Build STIX bundle
    stix_bundle = None
    try:
        bundle = build_stix_bundle(ai_finding)
        validate_bundle(bundle)
        stix_bundle = bundle
        bundle_id = bundle.get("id", "")
        await emit_event(
            AiStixGenerated(
                session_id=session_id,
                finding_id="",  # Will be updated after persist
                bundle_id=bundle_id,
            )
        )
    except Exception as exc:
        logger.warning("STIX bundle generation failed: %s", exc)

    # Structure remediation
    remediation = structure_remediation(ai_finding)
    await emit_event(
        AiRemediationReady(
            session_id=session_id,
            finding_id="",
            guidance_summary="; ".join(ai_finding.remediation_steps[:2]),
        )
    )

    # Dedup + persist
    confidence = max(
        normalize_confidence(ai_finding.confidence),
        severity_to_confidence_floor(ai_finding.severity),
    )

    finding_id = await upsert_finding(
        session_id=session_id,
        asset_id=asset_id,
        hunt_id=hunt_id,
        ai_finding=ai_finding,
        confidence=confidence,
        stix_bundle=stix_bundle,
        remediation=remediation,
        db=db,
    )

    # Fire-and-forget MCP enrichment — do not block finding persistence
    if finding_id and ai_finding.indicators:
        import asyncio
        from app.mcp.orchestrator import enrich_finding as _enrich_finding

        async def _do_enrichment():
            try:
                await _enrich_finding(
                    session_id=session_id,
                    finding_id=finding_id,
                    indicators=[ind.model_dump() for ind in ai_finding.indicators],
                )
            except Exception as exc:
                logger.warning("MCP enrichment failed for finding %s: %s", finding_id, exc)

        asyncio.create_task(_do_enrichment(), name=f"enrich-{finding_id}")

    return finding_id
