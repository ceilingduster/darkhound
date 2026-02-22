from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.schema import AiFinding
from app.core.db.models import Finding, FindingStatus, Severity

logger = logging.getLogger(__name__)


def compute_content_hash(asset_id: str, title: str, technique_ids: list[str]) -> str:
    """
    SHA-256 of (asset_id || title || primary_technique_id).
    Used as deduplication key.
    """
    primary_technique = technique_ids[0] if technique_ids else ""
    raw = f"{asset_id}|{title}|{primary_technique}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def upsert_finding(
    session_id: str,
    asset_id: str | None,
    hunt_id: str,
    ai_finding: AiFinding,
    confidence: float,
    stix_bundle: dict | None,
    remediation: dict | None,
    db: AsyncSession,            # kept for signature compat; no longer used
) -> str:
    """
    Insert a new Finding or update sighting_count on duplicate.
    Uses an independent DB session with its own commit so findings survive
    even if the caller's transaction is rolled back or never committed
    (e.g. browser refresh during a running hunt).
    Returns the finding ID.
    """
    if not asset_id:
        logger.warning("No asset_id provided for finding — skipping persist")
        return ""

    from app.core.db.engine import AsyncSessionLocal

    content_hash = compute_content_hash(
        asset_id, ai_finding.title, ai_finding.technique_ids
    )

    async with AsyncSessionLocal() as fdb:
        # Check for existing finding by content_hash
        result = await fdb.execute(
            select(Finding).where(Finding.content_hash == content_hash)
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            # Dedup hit — update sighting
            now = datetime.now(timezone.utc)
            await fdb.execute(
                update(Finding)
                .where(Finding.id == existing.id)
                .values(
                    last_seen=now,
                    sighting_count=Finding.sighting_count + 1,
                    confidence=max(existing.confidence, confidence),
                )
            )
            await fdb.commit()
            logger.info("Dedup hit for finding %s (hash=%s)", existing.id, content_hash[:16])
            return str(existing.id)

        # New finding
        finding_id = uuid.uuid4()
        try:
            severity_enum = Severity(ai_finding.severity.lower())
        except ValueError:
            severity_enum = Severity.medium

        finding = Finding(
            id=finding_id,
            session_id=uuid.UUID(session_id),
            asset_id=uuid.UUID(asset_id),
            hunt_execution_id=uuid.UUID(hunt_id),
            title=ai_finding.title,
            severity=severity_enum,
            confidence=confidence,
            content_hash=content_hash,
            stix_bundle=stix_bundle,
            remediation=remediation,
            status=FindingStatus.open,
            sighting_count=1,
        )
        fdb.add(finding)
        await fdb.commit()

        logger.info("New finding persisted: %s (severity=%s)", finding_id, ai_finding.severity)
        return str(finding_id)
