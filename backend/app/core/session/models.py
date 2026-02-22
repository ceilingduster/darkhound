from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class SessionContext:
    """Runtime session context — not persisted directly (ORM is source of truth)."""

    session_id: str
    asset_id: str
    analyst_id: str
    state: str = "INITIALIZING"
    mode: str = "ai"
    locked_by: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # Runtime locks (not serialized)
    command_lock: asyncio.Lock = field(default_factory=asyncio.Lock, compare=False, repr=False)
    ai_lock: asyncio.Lock = field(default_factory=asyncio.Lock, compare=False, repr=False)
    mode_mutex: asyncio.Lock = field(default_factory=asyncio.Lock, compare=False, repr=False)

    # SSH connection handle (injected by SSH engine)
    ssh_connection: object | None = field(default=None, compare=False, repr=False)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "asset_id": self.asset_id,
            "analyst_id": self.analyst_id,
            "state": self.state,
            "mode": self.mode,
            "locked_by": self.locked_by,
            "created_at": self.created_at.isoformat(),
        }
