from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.db.models import Session as SessionModel, SessionState, SessionMode
from app.core.events.emitter import emit_event
from app.core.events.schema import (
    SessionCreated,
    SessionStateChanged,
    SessionTerminated,
    SystemError,
)
from .models import SessionContext
from .state import validate_transition, InvalidTransitionError

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Registry for all active sessions.
    Enforces concurrency limit and FSM transitions.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, SessionContext] = {}
        self._semaphore = asyncio.Semaphore(settings.max_sessions)
        self._lock = asyncio.Lock()

    @property
    def active_count(self) -> int:
        return len(self._sessions)

    def get(self, session_id: str) -> Optional[SessionContext]:
        return self._sessions.get(session_id)

    def get_all(self) -> list[SessionContext]:
        return list(self._sessions.values())

    async def create_session(
        self,
        asset_id: str,
        analyst_id: str,
        db: AsyncSession,
    ) -> SessionContext:
        if not self._semaphore._value:  # noqa: SLF001
            raise RuntimeError(f"Session limit reached ({settings.max_sessions})")

        await self._semaphore.acquire()
        session_id = str(uuid.uuid4())

        # Persist to DB
        db_session = SessionModel(
            id=uuid.UUID(session_id),
            asset_id=uuid.UUID(asset_id),
            analyst_id=analyst_id,
            state=SessionState.INITIALIZING,
            mode=SessionMode.ai,
        )
        db.add(db_session)
        await db.flush()

        ctx = SessionContext(
            session_id=session_id,
            asset_id=asset_id,
            analyst_id=analyst_id,
        )

        async with self._lock:
            self._sessions[session_id] = ctx

        await emit_event(
            SessionCreated(
                session_id=session_id,
                asset_id=asset_id,
                analyst_id=analyst_id,
            )
        )

        # Record timeline event
        from app.intelligence.timeline.recorder import record_timeline_event
        await record_timeline_event(
            asset_id=asset_id,
            event_type="session.created",
            analyst_id=analyst_id,
            payload={"session_id": session_id},
            session_id=session_id,
            db=db,
        )

        logger.info("Session created: %s (asset=%s)", session_id, asset_id)
        return ctx

    async def transition(
        self,
        session_id: str,
        to_state: str,
        reason: str = "",
        db: AsyncSession | None = None,
    ) -> None:
        ctx = self._sessions.get(session_id)
        if ctx is None:
            raise KeyError(f"Session {session_id} not found")

        from_state_str = ctx.state
        from_state = SessionState(from_state_str)
        to_state_enum = SessionState(to_state)

        try:
            validate_transition(from_state, to_state_enum)
        except InvalidTransitionError as exc:
            await emit_event(
                SystemError(
                    session_id=session_id,
                    component="session_manager",
                    error=str(exc),
                    severity="high",
                )
            )
            raise

        ctx.state = to_state
        logger.info("Session %s: %s → %s (%s)", session_id, from_state_str, to_state, reason)

        if db is not None:
            from sqlalchemy import update
            from app.core.db.models import Session as SessionModel
            await db.execute(
                update(SessionModel)
                .where(SessionModel.id == uuid.UUID(session_id))
                .values(state=to_state_enum)
            )

        await emit_event(
            SessionStateChanged(
                session_id=session_id,
                from_state=from_state_str,
                to_state=to_state,
                reason=reason,
            )
        )

        if to_state in (SessionState.TERMINATED, SessionState.FAILED):
            await self._cleanup_session(session_id)

    async def _cleanup_session(self, session_id: str) -> None:
        async with self._lock:
            ctx = self._sessions.pop(session_id, None)

        if ctx is not None:
            self._semaphore.release()
            if ctx.ssh_connection is not None:
                try:
                    ctx.ssh_connection.close()
                except Exception:
                    pass
            await emit_event(SessionTerminated(session_id=session_id))
            logger.info("Session cleaned up: %s", session_id)

    async def shutdown_all(self) -> None:
        """Gracefully terminate all active sessions. Called during server shutdown."""
        session_ids = list(self._sessions.keys())
        logger.info("Shutting down %d active session(s)", len(session_ids))
        for session_id in session_ids:
            try:
                await self._cleanup_session(session_id)
            except Exception as exc:
                logger.warning("Error cleaning up session %s during shutdown: %s", session_id, exc)

    async def reap_stale_sessions(self, max_age_seconds: int = 3600) -> int:
        """Remove sessions that have been in non-terminal states too long without activity."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        reaped = 0

        for session_id, ctx in list(self._sessions.items()):
            age = (now - ctx.created_at).total_seconds()
            if age > max_age_seconds and ctx.state in ("DISCONNECTED", "FAILED"):
                try:
                    await self._cleanup_session(session_id)
                    reaped += 1
                except Exception as exc:
                    logger.warning("Failed to reap stale session %s: %s", session_id, exc)

        if reaped > 0:
            logger.info("Reaped %d stale session(s)", reaped)
        return reaped

    async def lock_session(self, session_id: str, analyst_id: str) -> None:
        ctx = self._sessions.get(session_id)
        if ctx is None:
            raise KeyError(f"Session {session_id} not found")
        ctx.locked_by = analyst_id
        await self.transition(session_id, SessionState.LOCKED, reason=f"locked by {analyst_id}")

    async def unlock_session(self, session_id: str, analyst_id: str) -> None:
        ctx = self._sessions.get(session_id)
        if ctx is None:
            raise KeyError(f"Session {session_id} not found")
        if ctx.locked_by not in (None, analyst_id):
            raise PermissionError(f"Session locked by {ctx.locked_by}, cannot unlock as {analyst_id}")
        ctx.locked_by = None
        await self.transition(session_id, SessionState.RUNNING, reason=f"unlocked by {analyst_id}")


# Global singleton
session_manager = SessionManager()
