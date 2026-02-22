from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.core.db.models import HuntExecution, HuntState, Session as SessionModel
from .deps import CurrentUser, DbDep

router = APIRouter(prefix="/hunts", tags=["hunts"])


# ── Shared schemas ────────────────────────────────────────────────────────────

class HuntStepSchema(BaseModel):
    id: str
    description: str
    command: str
    timeout: int = 30
    requires_sudo: bool = False


class HuntModuleResponse(BaseModel):
    id: str
    name: str
    description: str
    os_types: list[str]
    tags: list[str]
    severity_hint: str
    step_count: int


class HuntModuleDetail(BaseModel):
    id: str
    name: str
    description: str
    os_types: list[str]
    tags: list[str]
    severity_hint: str
    steps: list[HuntStepSchema]


class HuntModuleSave(BaseModel):
    id: str
    name: str
    description: str
    os_types: list[str] = ["linux"]
    tags: list[str] = []
    severity_hint: str = "medium"
    steps: list[HuntStepSchema] = []


class HuntStartRequest(BaseModel):
    session_id: str
    module_id: str
    run_ai: bool = True


class HuntResponse(BaseModel):
    id: str
    session_id: str
    module_id: str
    state: str

    model_config = {"from_attributes": True}


class AiReportResponse(BaseModel):
    hunt_id: str
    session_id: str
    ai_report_text: str | None
    started_at: str | None


# ── Hunt module CRUD ──────────────────────────────────────────────────────────

_SAFE_ID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def _modules_dir() -> Path:
    from app.hunt.loader import HUNT_MODULES_PATH
    return Path(HUNT_MODULES_PATH)


@router.get("/modules", response_model=list[HuntModuleResponse])
async def list_modules(current_user: CurrentUser):
    from app.hunt.loader import module_registry
    modules = module_registry.list_modules()
    return [
        HuntModuleResponse(
            id=m.id,
            name=m.name,
            description=m.description,
            os_types=m.os_types,
            tags=m.tags,
            severity_hint=m.severity_hint,
            step_count=len(m.steps),
        )
        for m in modules
    ]


@router.get("/modules/{module_id}", response_model=HuntModuleDetail)
async def get_module(module_id: str, current_user: CurrentUser):
    from app.hunt.loader import module_registry
    m = module_registry.get(module_id)
    if m is None:
        raise HTTPException(status_code=404, detail="Module not found")
    return HuntModuleDetail(
        id=m.id,
        name=m.name,
        description=m.description,
        os_types=m.os_types,
        tags=m.tags,
        severity_hint=m.severity_hint,
        steps=[
            HuntStepSchema(
                id=s.id,
                description=s.description,
                command=s.command,
                timeout=s.timeout,
                requires_sudo=s.requires_sudo,
            )
            for s in m.steps
        ],
    )


@router.post("/modules", response_model=HuntModuleDetail, status_code=status.HTTP_201_CREATED)
async def create_module(body: HuntModuleSave, current_user: CurrentUser):
    from app.hunt.loader import module_registry, serialize_module
    from app.hunt.models import HuntModule, HuntStep

    if not _SAFE_ID.match(body.id):
        raise HTTPException(status_code=400, detail="Module ID must be lowercase alphanumeric/underscores, start with a letter, max 64 chars")

    if module_registry.get(body.id) is not None:
        raise HTTPException(status_code=409, detail=f"Module '{body.id}' already exists")

    module = HuntModule(
        id=body.id,
        name=body.name,
        description=body.description,
        os_types=body.os_types,
        tags=body.tags,
        severity_hint=body.severity_hint,
        steps=[
            HuntStep(id=s.id, description=s.description, command=s.command, timeout=s.timeout, requires_sudo=s.requires_sudo)
            for s in body.steps
        ],
    )

    md = serialize_module(module)
    path = _modules_dir() / f"{module.id}.md"
    path.write_text(md, encoding="utf-8")

    module_registry.reload()

    return await get_module(body.id, current_user)


@router.put("/modules/{module_id}", response_model=HuntModuleDetail)
async def update_module(module_id: str, body: HuntModuleSave, current_user: CurrentUser):
    from app.hunt.loader import module_registry, serialize_module
    from app.hunt.models import HuntModule, HuntStep

    if module_registry.get(module_id) is None:
        raise HTTPException(status_code=404, detail="Module not found")

    module = HuntModule(
        id=body.id,
        name=body.name,
        description=body.description,
        os_types=body.os_types,
        tags=body.tags,
        severity_hint=body.severity_hint,
        steps=[
            HuntStep(id=s.id, description=s.description, command=s.command, timeout=s.timeout, requires_sudo=s.requires_sudo)
            for s in body.steps
        ],
    )

    md = serialize_module(module)

    # If ID changed, remove old file
    old_path = _modules_dir() / f"{module_id}.md"
    new_path = _modules_dir() / f"{body.id}.md"
    if old_path.exists() and module_id != body.id:
        old_path.unlink()
    new_path.write_text(md, encoding="utf-8")

    module_registry.reload()

    return await get_module(body.id, current_user)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(module_id: str, current_user: CurrentUser):
    from app.hunt.loader import module_registry

    if module_registry.get(module_id) is None:
        raise HTTPException(status_code=404, detail="Module not found")

    path = _modules_dir() / f"{module_id}.md"
    if path.exists():
        path.unlink()

    module_registry.reload()


# ── Hunt execution endpoints ──────────────────────────────────────────────────

@router.post("", response_model=HuntResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_hunt(body: HuntStartRequest, db: DbDep, current_user: CurrentUser):
    from app.hunt.orchestrator import hunt_orchestrator

    try:
        hunt_id = await hunt_orchestrator.start(
            session_id=body.session_id,
            module_id=body.module_id,
            analyst_id=current_user.username,
            run_ai=body.run_ai,
            db=db,
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    result = await db.execute(
        select(HuntExecution).where(HuntExecution.id == uuid.UUID(hunt_id))
    )
    hunt = result.scalar_one()
    return HuntResponse(
        id=str(hunt.id),
        session_id=str(hunt.session_id),
        module_id=hunt.module_id,
        state=hunt.state.value,
    )


@router.get("/{hunt_id}", response_model=HuntResponse)
async def get_hunt(hunt_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(HuntExecution).where(HuntExecution.id == uuid.UUID(hunt_id))
    )
    hunt = result.scalar_one_or_none()
    if hunt is None:
        raise HTTPException(status_code=404, detail="Hunt not found")
    return HuntResponse(
        id=str(hunt.id),
        session_id=str(hunt.session_id),
        module_id=hunt.module_id,
        state=hunt.state.value,
    )


@router.post("/{hunt_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_hunt(hunt_id: str, current_user: CurrentUser):
    from app.hunt.orchestrator import hunt_orchestrator
    try:
        await hunt_orchestrator.cancel(hunt_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/session/{session_id}/reports", response_model=list[AiReportResponse])
async def get_session_ai_reports(session_id: str, db: DbDep, current_user: CurrentUser):
    """Return all AI reports for hunt executions in a session."""
    result = await db.execute(
        select(HuntExecution)
        .where(HuntExecution.session_id == uuid.UUID(session_id))
        .where(HuntExecution.ai_report_text.isnot(None))
        .order_by(HuntExecution.started_at.desc())
    )
    hunts = result.scalars().all()
    return [
        AiReportResponse(
            hunt_id=str(h.id),
            session_id=str(h.session_id),
            ai_report_text=h.ai_report_text,
            started_at=h.started_at.isoformat() if h.started_at else None,
        )
        for h in hunts
    ]


@router.get("/asset/{asset_id}/reports", response_model=list[AiReportResponse])
async def get_asset_ai_reports(asset_id: str, db: DbDep, current_user: CurrentUser):
    """Return all AI reports for hunt executions across all sessions for an asset."""
    result = await db.execute(
        select(HuntExecution)
        .join(SessionModel, HuntExecution.session_id == SessionModel.id)
        .where(SessionModel.asset_id == uuid.UUID(asset_id))
        .where(HuntExecution.ai_report_text.isnot(None))
        .order_by(HuntExecution.started_at.desc())
    )
    hunts = result.scalars().all()
    return [
        AiReportResponse(
            hunt_id=str(h.id),
            session_id=str(h.session_id),
            ai_report_text=h.ai_report_text,
            started_at=h.started_at.isoformat() if h.started_at else None,
        )
        for h in hunts
    ]


@router.delete("/{hunt_id}/report")
async def delete_hunt_ai_report(hunt_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(HuntExecution).where(HuntExecution.id == uuid.UUID(hunt_id))
    )
    hunt = result.scalar_one_or_none()
    if hunt is None:
        raise HTTPException(status_code=404, detail="Hunt not found")
    await db.execute(
        update(HuntExecution)
        .where(HuntExecution.id == uuid.UUID(hunt_id))
        .values(ai_report_text=None)
    )
    await db.commit()
    return {"ok": True}
