from __future__ import annotations

import logging

from .socketio import sio
from app.core.session import session_manager
from app.core.events.emitter import emit_event
from app.core.events.schema import TerminalResize, SystemError

logger = logging.getLogger(__name__)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None) -> bool:
    """
    Authenticate Socket.IO connection via JWT in auth payload.
    Returns False to reject.
    """
    token = None
    if auth:
        token = auth.get("token")
    if not token:
        # Try query string
        query = environ.get("QUERY_STRING", "")
        for part in query.split("&"):
            if part.startswith("token="):
                token = part[6:]
                break

    if not token:
        logger.warning("Socket.IO connection rejected — no token (sid=%s)", sid)
        return False

    try:
        from app.core.security.auth import verify_access_token
        payload = verify_access_token(token)
        await sio.save_session(sid, {"user": payload["sub"], "role": payload.get("role")})
        logger.info("Socket.IO connected: sid=%s user=%s", sid, payload["sub"])
        return True
    except ValueError as exc:
        logger.warning("Socket.IO auth failed: %s (sid=%s)", exc, sid)
        return False


@sio.event
async def disconnect(sid: str) -> None:
    logger.info("Socket.IO disconnected: sid=%s", sid)


@sio.event
async def join_session(sid: str, data: dict) -> dict:
    """Join a session room to receive session-scoped events."""
    session_id = data.get("session_id")
    if not session_id:
        return {"error": "session_id required"}

    ctx = session_manager.get(session_id)
    if ctx is None:
        return {"error": f"Session {session_id} not found"}

    sio_session = await sio.get_session(sid)
    analyst_id = sio_session.get("user")

    # Only the session owner or admin can join
    if ctx.analyst_id != analyst_id:
        role = sio_session.get("role")
        if role != "admin":
            return {"error": "Not authorized to join this session"}

    await sio.enter_room(sid, session_id)
    logger.info("sid=%s joined room=%s", sid, session_id)
    return {"ok": True, "session_id": session_id}


@sio.event
async def leave_session(sid: str, data: dict) -> dict:
    session_id = data.get("session_id")
    if session_id:
        await sio.leave_room(sid, session_id)
    return {"ok": True}


@sio.event
async def toggle_mode(sid: str, data: dict) -> dict:
    """
    Switch session between AI and interactive (PTY) mode.
    data: { session_id, mode: 'ai' | 'interactive' }
    """
    session_id = data.get("session_id")
    mode = data.get("mode", "ai")

    if not session_id:
        return {"error": "session_id required"}

    ctx = session_manager.get(session_id)
    if ctx is None:
        return {"error": f"Session {session_id} not found"}

    sio_session = await sio.get_session(sid)
    analyst_id = sio_session.get("user")
    if ctx.analyst_id != analyst_id:
        role = sio_session.get("role")
        if role != "admin":
            return {"error": "Not authorized"}

    if mode == "interactive" and ctx.mode != "interactive":
        # Start PTY session as background task
        import asyncio
        from app.ssh.pty import start_pty_session
        asyncio.create_task(
            start_pty_session(session_id),
            name=f"pty-{session_id}",
        )
        from app.core.events.schema import SessionModeChanged
        await emit_event(SessionModeChanged(session_id=session_id, from_mode="ai", to_mode="interactive"))
        return {"ok": True, "mode": "interactive"}

    elif mode == "ai" and ctx.mode != "ai":
        from app.ssh.pty import close_pty_session
        await close_pty_session(session_id, reason="analyst toggled to AI mode")
        from app.core.events.schema import SessionModeChanged
        await emit_event(SessionModeChanged(session_id=session_id, from_mode="interactive", to_mode="ai"))
        return {"ok": True, "mode": "ai"}

    return {"ok": True, "mode": ctx.mode}


@sio.event
async def terminal_input(sid: str, data: dict) -> None:
    """
    Forward PTY input from browser to SSH session.
    data: { session_id, input (base64 or raw str) }
    """
    session_id = data.get("session_id")
    if not session_id:
        return

    ctx = session_manager.get(session_id)
    if ctx is None or ctx.mode != "interactive":
        return

    if ctx.ssh_connection is None:
        return

    raw = data.get("input", "")
    try:
        import base64
        decoded = base64.b64decode(raw)
    except Exception:
        decoded = raw.encode() if isinstance(raw, str) else raw

    try:
        await ctx.ssh_connection.write_pty(decoded)
    except Exception as exc:
        logger.error("PTY write error session=%s: %s", session_id, exc)


@sio.event
async def terminal_resize(sid: str, data: dict) -> None:
    """Handle xterm.js terminal resize."""
    session_id = data.get("session_id")
    cols = data.get("cols", 80)
    rows = data.get("rows", 24)

    if not session_id:
        return

    ctx = session_manager.get(session_id)
    if ctx is None or ctx.ssh_connection is None:
        return

    try:
        await ctx.ssh_connection.resize_pty(cols, rows)
        await emit_event(TerminalResize(session_id=session_id, cols=cols, rows=rows))
    except Exception as exc:
        logger.error("PTY resize error session=%s: %s", session_id, exc)
