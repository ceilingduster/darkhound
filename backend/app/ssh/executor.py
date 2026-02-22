from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from app.core.events.emitter import emit_event
from app.core.events.schema import (
    SshCommandCompleted,
    SshCommandOutput,
    SshCommandStarted,
    SshError,
)
from app.core.security.classifier import CommandClass, classify_command
from app.core.session.manager import session_manager
from .engine import SshConnection, SshConnectionError

logger = logging.getLogger(__name__)


class CommandBlockedError(Exception):
    """Raised when a command is blocked by the safety classifier."""


class CommandSuspectError(Exception):
    """Raised when a command is classified as SUSPECT and not approved."""


async def execute_command(
    session_id: str,
    command: str,
    timeout: int = 30,
    allow_suspect: bool = False,
    sudo_password: str | None = None,
) -> tuple[str, str, int]:
    """
    Execute an AI-mode command with safety classification and event emission.

    Returns (stdout, stderr, exit_code).
    Raises CommandBlockedError or CommandSuspectError before execution if unsafe.
    """
    cls, reason = classify_command(command)

    if cls == CommandClass.BLOCKED:
        msg = f"Command blocked by safety classifier: {reason}"
        logger.warning("BLOCKED command in session=%s: %s", session_id, command[:100])
        await emit_event(SshError(session_id=session_id, error_code="COMMAND_BLOCKED", message=msg))
        raise CommandBlockedError(msg)

    if cls == CommandClass.SUSPECT and not allow_suspect:
        msg = f"Command requires analyst approval: {reason}"
        logger.info("SUSPECT command in session=%s: %s", session_id, command[:100])
        raise CommandSuspectError(msg)

    ctx = session_manager.get(session_id)
    if ctx is None:
        raise RuntimeError(f"Session {session_id} not found")

    if ctx.mode == "interactive":
        raise RuntimeError("Cannot execute AI commands while in interactive (PTY) mode")

    async with ctx.command_lock:
        conn: SshConnection = ctx.ssh_connection
        if conn is None or not conn.is_connected:
            raise SshConnectionError("SSH not connected")

        command_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc)

        await emit_event(
            SshCommandStarted(session_id=session_id, command_id=command_id, command=command)
        )

        try:
            stdout, stderr, exit_code = await conn.run_command(
                command, timeout=timeout, sudo_password=sudo_password,
            )
        except SshConnectionError as exc:
            await emit_event(
                SshError(session_id=session_id, error_code="SSH_ERROR", message=str(exc))
            )
            raise

        duration_ms = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)

        # Emit output events (chunked for large outputs)
        if stdout:
            for chunk in _chunk_string(stdout, 4096):
                await emit_event(
                    SshCommandOutput(
                        session_id=session_id,
                        command_id=command_id,
                        chunk=chunk,
                        stream="stdout",
                    )
                )

        if stderr:
            for chunk in _chunk_string(stderr, 4096):
                await emit_event(
                    SshCommandOutput(
                        session_id=session_id,
                        command_id=command_id,
                        chunk=chunk,
                        stream="stderr",
                    )
                )

        await emit_event(
            SshCommandCompleted(
                session_id=session_id,
                command_id=command_id,
                exit_code=exit_code,
                duration_ms=duration_ms,
            )
        )

        return stdout, stderr, exit_code


def _chunk_string(s: str, size: int):
    for i in range(0, len(s), size):
        yield s[i:i + size]
