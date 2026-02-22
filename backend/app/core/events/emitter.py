from __future__ import annotations

import asyncio
import logging

from .bus import event_bus
from .schema import BaseEvent

logger = logging.getLogger(__name__)

# Injected at startup from transport/socketio.py to avoid circular imports
_sio = None


def init_emitter(sio) -> None:
    global _sio
    _sio = sio


async def emit_event(event: BaseEvent) -> None:
    """Put event on bus and emit to Socket.IO room."""
    await event_bus.put(event, session_id=event.session_id)
    if _sio is not None and event.session_id:
        try:
            await _sio.emit(
                event.event_type,
                event.model_dump(mode="json"),
                room=event.session_id,
            )
        except Exception as exc:
            logger.error("Socket.IO emit failed for %s: %s", event.event_type, exc)


async def emit_to_session(event: BaseEvent, session_id: str | None = None) -> None:
    """Emit to a specific session room (overrides event.session_id for routing)."""
    target = session_id or event.session_id
    if _sio is not None and target:
        try:
            await _sio.emit(
                event.event_type,
                event.model_dump(mode="json"),
                room=target,
            )
        except Exception as exc:
            logger.error("Socket.IO targeted emit failed: %s", exc)


async def bus_drain_loop() -> None:
    """Background task: drain event bus (for logging/persistence hooks)."""
    while True:
        try:
            event = await event_bus.get()
            event_bus.task_done()
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Bus drain error: %s", exc)
