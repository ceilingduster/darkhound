from __future__ import annotations

import asyncio
import base64
import logging
import time

from app.core.events.emitter import emit_event
from app.core.events.schema import TerminalClosed, TerminalData, TerminalStarted
from app.core.session.manager import session_manager

logger = logging.getLogger(__name__)

# Rate limiting: max events per second for PTY output
PTY_MAX_EVENTS_PER_SECOND = 60
PTY_COALESCE_INTERVAL = 1.0 / PTY_MAX_EVENTS_PER_SECOND  # ~16ms
PTY_MAX_COALESCE_BUFFER = 8192  # Max bytes to coalesce before forced flush


class PtyRateLimiter:
    """
    Coalesces rapid PTY output chunks to prevent Socket.IO flooding.
    Buffers data and flushes at most PTY_MAX_EVENTS_PER_SECOND times per second.
    """

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._buffer = bytearray()
        self._last_flush = 0.0
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task | None = None
        self._closed = False

    async def write(self, raw_bytes: bytes) -> None:
        async with self._lock:
            self._buffer.extend(raw_bytes)

            now = time.monotonic()
            elapsed = now - self._last_flush

            # Flush immediately if enough time has passed or buffer is large
            if elapsed >= PTY_COALESCE_INTERVAL or len(self._buffer) >= PTY_MAX_COALESCE_BUFFER:
                await self._flush()
            elif self._flush_task is None or self._flush_task.done():
                # Schedule a deferred flush
                self._flush_task = asyncio.create_task(self._deferred_flush())

    async def _deferred_flush(self) -> None:
        await asyncio.sleep(PTY_COALESCE_INTERVAL)
        async with self._lock:
            if self._buffer and not self._closed:
                await self._flush()

    async def _flush(self) -> None:
        if not self._buffer:
            return
        data = bytes(self._buffer)
        self._buffer.clear()
        self._last_flush = time.monotonic()

        encoded = base64.b64encode(data).decode()
        await emit_event(TerminalData(session_id=self._session_id, data=encoded))

    async def close(self) -> None:
        self._closed = True
        async with self._lock:
            if self._buffer:
                await self._flush()
        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()


async def start_pty_session(session_id: str, cols: int = 80, rows: int = 24) -> None:
    """
    Open an interactive PTY channel on the session's SSH connection.
    Switches session mode to 'interactive'.
    Emits terminal.started and streams terminal.data events.
    """
    ctx = session_manager.get(session_id)
    if ctx is None:
        raise KeyError(f"Session {session_id} not found")

    if ctx.ssh_connection is None:
        raise RuntimeError("SSH not connected")

    # Mode mutex: block if AI command is in flight
    async with ctx.mode_mutex:
        ctx.mode = "interactive"
        logger.info("PTY session starting: session=%s cols=%d rows=%d", session_id, cols, rows)

        rate_limiter = PtyRateLimiter(session_id)

        async def on_data(raw_bytes: bytes) -> None:
            await rate_limiter.write(raw_bytes)

        try:
            process = await ctx.ssh_connection.open_pty(
                cols=cols,
                rows=rows,
                data_callback=on_data,
            )
            await emit_event(TerminalStarted(session_id=session_id, cols=cols, rows=rows))

            # Wait for PTY to close
            await process.wait_closed()

        finally:
            await rate_limiter.close()
            ctx.mode = "ai"
            await emit_event(TerminalClosed(session_id=session_id, reason="pty closed"))
            logger.info("PTY session ended: session=%s", session_id)


async def close_pty_session(session_id: str, reason: str = "analyst request") -> None:
    ctx = session_manager.get(session_id)
    if ctx is None:
        return
    if ctx.ssh_connection is not None:
        await ctx.ssh_connection.close_pty(reason)
    ctx.mode = "ai"
    await emit_event(TerminalClosed(session_id=session_id, reason=reason))
