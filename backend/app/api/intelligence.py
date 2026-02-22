from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.db.models import Finding, TimelineEvent
from .deps import CurrentUser, DbDep

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


class FindingResponse(BaseModel):
    id: str
    session_id: str
    asset_id: str
    title: str
    severity: str
    confidence: float
    status: str
    sighting_count: int
    first_seen: str
    stix_bundle: dict | None
    remediation: dict | None

    model_config = {"from_attributes": True}


class TimelineEventResponse(BaseModel):
    id: str
    asset_id: str
    event_type: str
    payload: dict | None
    occurred_at: str
    analyst_id: str

    model_config = {"from_attributes": True}


@router.get("/findings", response_model=list[FindingResponse])
async def list_findings(
    db: DbDep,
    current_user: CurrentUser,
    asset_id: str | None = None,
    session_id: str | None = None,
):
    query = select(Finding).order_by(Finding.first_seen.desc())
    if asset_id:
        query = query.where(Finding.asset_id == uuid.UUID(asset_id))
    if session_id:
        query = query.where(Finding.session_id == uuid.UUID(session_id))
    result = await db.execute(query)
    findings = result.scalars().all()
    return [
        FindingResponse(
            id=str(f.id),
            session_id=str(f.session_id),
            asset_id=str(f.asset_id),
            title=f.title,
            severity=f.severity.value,
            confidence=f.confidence,
            status=f.status.value,
            sighting_count=f.sighting_count,
            first_seen=f.first_seen.isoformat(),
            stix_bundle=f.stix_bundle,
            remediation=f.remediation,
        )
        for f in findings
    ]


@router.get("/findings/{finding_id}", response_model=FindingResponse)
async def get_finding(finding_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(select(Finding).where(Finding.id == uuid.UUID(finding_id)))
    f = result.scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return FindingResponse(
        id=str(f.id),
        session_id=str(f.session_id),
        asset_id=str(f.asset_id),
        title=f.title,
        severity=f.severity.value,
        confidence=f.confidence,
        status=f.status.value,
        sighting_count=f.sighting_count,
        first_seen=f.first_seen.isoformat(),
        stix_bundle=f.stix_bundle,
        remediation=f.remediation,
    )


@router.get("/findings/{finding_id}/stix")
async def get_stix_bundle(finding_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(select(Finding).where(Finding.id == uuid.UUID(finding_id)))
    f = result.scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    if not f.stix_bundle:
        raise HTTPException(status_code=404, detail="No STIX bundle available")
    return f.stix_bundle


@router.get("/timeline/{asset_id}", response_model=list[TimelineEventResponse])
async def get_timeline(asset_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(
        select(TimelineEvent)
        .where(TimelineEvent.asset_id == uuid.UUID(asset_id))
        .order_by(TimelineEvent.occurred_at.desc())
    )
    events = result.scalars().all()
    return [
        TimelineEventResponse(
            id=str(e.id),
            asset_id=str(e.asset_id),
            event_type=e.event_type,
            payload=e.payload,
            occurred_at=e.occurred_at.isoformat(),
            analyst_id=e.analyst_id,
        )
        for e in events
    ]


@router.delete("/timeline/{asset_id}")
async def clear_timeline(asset_id: str, db: DbDep, current_user: CurrentUser):
    from sqlalchemy import delete as sa_delete
    await db.execute(
        sa_delete(TimelineEvent).where(TimelineEvent.asset_id == uuid.UUID(asset_id))
    )
    await db.commit()
    return {"ok": True}


@router.patch("/findings/{finding_id}/status")
async def update_finding_status(
    finding_id: str,
    body: dict,
    db: DbDep,
    current_user: CurrentUser,
):
    result = await db.execute(select(Finding).where(Finding.id == uuid.UUID(finding_id)))
    f = result.scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Finding not found")

    from app.core.db.models import FindingStatus
    new_status = body.get("status")
    if new_status not in [s.value for s in FindingStatus]:
        raise HTTPException(status_code=400, detail="Invalid status")

    f.status = FindingStatus(new_status)
    await db.flush()
    return {"ok": True, "status": new_status}


@router.delete("/findings/{finding_id}")
async def delete_finding(
    finding_id: str,
    db: DbDep,
    current_user: CurrentUser,
):
    result = await db.execute(select(Finding).where(Finding.id == uuid.UUID(finding_id)))
    f = result.scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    await db.delete(f)
    await db.commit()
    return {"ok": True}
