from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db.models import TimelineEvent
from app.core.events.emitter import emit_event
from app.core.events.schema import TimelineEventRecorded

logger = logging.getLogger(__name__)


async def record_timeline_event(
    asset_id: str,
    event_type: str,
    analyst_id: str,
    payload: dict | None = None,
    session_id: str | None = None,
    db: AsyncSession | None = None,
) -> str:
    """
    Persist a timeline event and emit TimelineEventRecorded.
    Returns the event ID.
    """
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    if db is not None:
        te = TimelineEvent(
            id=uuid.UUID(event_id),
            asset_id=uuid.UUID(asset_id),
            session_id=uuid.UUID(session_id) if session_id else None,
            event_type=event_type,
            payload=payload or {},
            occurred_at=now,
            analyst_id=analyst_id,
        )
        db.add(te)
        await db.flush()

    await emit_event(
        TimelineEventRecorded(
            asset_id=asset_id,
            event_id=event_id,
            event_type_name=event_type,
        )
    )

    logger.debug("Timeline event recorded: type=%s asset=%s", event_type, asset_id)
    return event_id
