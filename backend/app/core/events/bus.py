from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator

from app.config import settings
from .schema import BaseEvent, SystemBackpressure

logger = logging.getLogger(__name__)

_BACKPRESSURE_THRESHOLD = 0.9  # 90%


class EventBus:
    """
    Bounded asyncio.Queue-based internal event bus.

    Producers call put(event); consumers iterate via subscribe().
    Backpressure is signalled via system.backpressure events.
    """

    def __init__(self, maxsize: int | None = None) -> None:
        self._maxsize = maxsize or settings.event_queue_max
        self._queue: asyncio.Queue[BaseEvent] = asyncio.Queue(maxsize=self._maxsize)
        self._subscribers: list[asyncio.Queue[BaseEvent]] = []

    async def put(self, event: BaseEvent, session_id: str | None = None) -> None:
        depth = self._queue.qsize()
        if depth >= self._maxsize * _BACKPRESSURE_THRESHOLD:
            bp_event = SystemBackpressure(
                session_id=session_id or event.session_id or "",
                component="event_bus",
                queue_depth=depth,
                limit=self._maxsize,
            )
            logger.warning("Event bus backpressure: depth=%d limit=%d", depth, self._maxsize)
            # Emit backpressure non-blockingly (best-effort)
            try:
                self._queue.put_nowait(bp_event)
            except asyncio.QueueFull:
                pass

        try:
            await asyncio.wait_for(self._queue.put(event), timeout=0.1)
        except asyncio.TimeoutError:
            logger.warning("Event bus full — dropping event: %s", event.event_type)

    def put_nowait(self, event: BaseEvent) -> None:
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("Event bus full (nowait) — dropping: %s", event.event_type)

    async def get(self) -> BaseEvent:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    @property
    def qsize(self) -> int:
        return self._queue.qsize()


# Global singleton event bus
event_bus = EventBus()
