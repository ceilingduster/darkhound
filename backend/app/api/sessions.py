from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.core.db.models import Asset, Session as SessionModel, SessionMode, SessionState, OsType
from app.core.events.emitter import emit_event
from app.core.session.manager import session_manager
from .deps import CurrentUser, DbDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    asset_id: str
    mode: SessionMode = SessionMode.ai


class SessionResponse(BaseModel):
    id: str
    asset_id: str
    analyst_id: str
    state: str
    mode: str
    locked_by: str | None

    model_config = {"from_attributes": True}


async def _connect_session(session_id: str, asset_id: str, host: str, port: int, vault_path: str | None) -> None:
    """Background task: SSH connect → OS detect → transition to RUNNING."""
    from app.core.db.engine import AsyncSessionLocal
    from app.ssh.engine import create_ssh_connection, SshConnectionError
    from app.ssh.os_detect import detect_os

    try:
        # Load the asset so we can pass DB-stored credentials to the resolver
        asset_obj = None
        async with AsyncSessionLocal() as db:
            from sqlalchemy import select
            from app.core.db.models import Asset
            result = await db.execute(select(Asset).where(Asset.id == uuid.UUID(asset_id)))
            asset_obj = result.scalar_one_or_none()

        await create_ssh_connection(
            session_id=session_id,
            asset_id=asset_id,
            host=host,
            port=port,
            vault_path=vault_path,
            asset=asset_obj,
        )

        # Run OS detection and update the asset record
        os_info = {}
        try:
            os_info = await detect_os(session_id)
            async with AsyncSessionLocal() as db:
                os_type_val = OsType.unknown
                try:
                    os_type_val = OsType(os_info["os_type"])
                except ValueError:
                    pass

                await db.execute(
                    update(Asset)
                    .where(Asset.id == uuid.UUID(asset_id))
                    .values(
                        os_type=os_type_val,
                        os_version=os_info.get("os_version"),
                        platform_metadata=os_info.get("platform_metadata"),
                    )
                )
                await db.commit()
        except Exception as exc:
            logger.warning("OS detection failed for session %s: %s", session_id, exc)

        # Transition to RUNNING and record timeline
        async with AsyncSessionLocal() as db:
            await session_manager.transition(session_id, SessionState.RUNNING.value, reason="ssh connected", db=db)

            from app.intelligence.timeline.recorder import record_timeline_event
            ctx = session_manager.get(session_id)
            analyst_id = ctx.analyst_id if ctx else "system"
            await record_timeline_event(
                asset_id=asset_id,
                event_type="ssh.connected",
                analyst_id=analyst_id,
                payload={"host": host, "port": port, "os_info": os_info},
                session_id=session_id,
                db=db,
            )
            await db.commit()

    except SshConnectionError as exc:
        logger.error("SSH connect failed for session %s: %s", session_id, exc)
        # SshConnection.connect() already transitions to FAILED and emits SshError.
        # Ensure the DB row is also updated.
        try:
            async with AsyncSessionLocal() as db:
                ctx = session_manager.get(session_id)
                if ctx and ctx.state != SessionState.FAILED.value:
                    await session_manager.transition(session_id, SessionState.FAILED.value, reason=str(exc), db=db)
                    await db.commit()
        except Exception:
            pass
    except Exception as exc:
        logger.error("Session %s connect task failed: %s", session_id, exc, exc_info=True)
        try:
            from app.core.events.schema import SshError as SshErrorEvent
            await emit_event(SshErrorEvent(
                session_id=session_id,
                error_code="CONNECT_FAILED",
                message=str(exc),
            ))
            async with AsyncSessionLocal() as db:
                await session_manager.transition(session_id, SessionState.FAILED.value, reason=str(exc), db=db)
                await db.commit()
        except Exception:
            pass


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(body: SessionCreate, db: DbDep, current_user: CurrentUser):
    # Look up asset to get connection details
    result = await db.execute(select(Asset).where(Asset.id == uuid.UUID(body.asset_id)))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    if not asset.ip_address:
        raise HTTPException(status_code=400, detail="Asset has no IP address configured")

    try:
        ctx = await session_manager.create_session(
            asset_id=body.asset_id,
            analyst_id=current_user.username,
            db=db,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    # Launch SSH connection as background task — session will emit state events
    asyncio.create_task(
        _connect_session(
            session_id=ctx.session_id,
            asset_id=body.asset_id,
            host=asset.ip_address,
            port=asset.ssh_port or 22,
            vault_path=asset.credential_vault_path,
        ),
        name=f"connect-{ctx.session_id}",
    )

    return SessionResponse(
        id=ctx.session_id,
        asset_id=ctx.asset_id,
        analyst_id=ctx.analyst_id,
        state=ctx.state,
        mode=ctx.mode,
        locked_by=ctx.locked_by,
    )


@router.get("", response_model=list[SessionResponse])
async def list_sessions(db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(SessionModel).order_by(SessionModel.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        SessionResponse(
            id=str(s.id),
            asset_id=str(s.asset_id),
            analyst_id=s.analyst_id,
            state=s.state.value,
            mode=s.mode.value,
            locked_by=s.locked_by,
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(SessionModel).where(SessionModel.id == uuid.UUID(session_id))
    )
    s = result.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(
        id=str(s.id),
        asset_id=str(s.asset_id),
        analyst_id=s.analyst_id,
        state=s.state.value,
        mode=s.mode.value,
        locked_by=s.locked_by,
    )


@router.post("/{session_id}/lock", status_code=status.HTTP_200_OK)
async def lock_session(session_id: str, current_user: CurrentUser):
    try:
        await session_manager.lock_session(session_id, current_user.username)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@router.post("/{session_id}/unlock", status_code=status.HTTP_200_OK)
async def unlock_session(session_id: str, current_user: CurrentUser):
    try:
        await session_manager.unlock_session(session_id, current_user.username)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"ok": True}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def terminate_session(session_id: str, current_user: CurrentUser, db: DbDep):
    try:
        await session_manager.transition(
            session_id, "TERMINATED", reason="analyst request", db=db
        )
    except KeyError:
        # Session exists in DB but not in the in-memory manager (e.g. after
        # server restart).  Update the DB row directly so the UI can close it.
        from sqlalchemy import update as sa_update
        result = await db.execute(
            select(SessionModel).where(SessionModel.id == uuid.UUID(session_id))
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        await db.execute(
            sa_update(SessionModel)
            .where(SessionModel.id == uuid.UUID(session_id))
            .values(state=SessionState.TERMINATED)
        )
        await db.commit()
        logger.info("Terminated orphaned DB session %s", session_id)
