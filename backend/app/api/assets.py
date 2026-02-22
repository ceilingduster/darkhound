from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, select

from app.core.db.models import Asset, Finding, HuntExecution, OsType, Session, TimelineEvent
from app.core.security.crypto import encrypt
from .deps import CurrentUser, AdminUser, DbDep

router = APIRouter(prefix="/assets", tags=["assets"])


class AssetCreate(BaseModel):
    hostname: str
    ip_address: str | None = None
    os_type: OsType = OsType.unknown
    os_version: str | None = None
    credential_vault_path: str | None = None
    ssh_username: str | None = None
    ssh_password: str | None = None
    ssh_key: str | None = None
    ssh_port: int | None = None
    sudo_method: str | None = None  # "nopasswd" | "ssh_password" | "custom_password" | null
    sudo_password: str | None = None
    tags: list[str] | None = None


class AssetResponse(BaseModel):
    id: str
    hostname: str
    ip_address: str | None
    os_type: str
    os_version: str | None
    tags: list[str] | None
    platform_metadata: dict | None
    credential_vault_path: str | None
    ssh_username: str | None = None
    ssh_port: int | None = None
    sudo_method: str | None = None
    has_credentials: bool = False

    model_config = {"from_attributes": True}


def _asset_response(asset: Asset) -> AssetResponse:
    has_creds = bool(asset.ssh_password or asset.ssh_key)
    return AssetResponse(
        id=str(asset.id),
        hostname=asset.hostname,
        ip_address=asset.ip_address,
        os_type=asset.os_type.value if isinstance(asset.os_type, OsType) else str(asset.os_type),
        os_version=asset.os_version,
        tags=asset.tags,
        platform_metadata=asset.platform_metadata,
        credential_vault_path=asset.credential_vault_path,
        ssh_username=asset.ssh_username,
        ssh_port=asset.ssh_port,
        sudo_method=asset.sudo_method,
        has_credentials=has_creds,
    )


@router.get("", response_model=list[AssetResponse])
async def list_assets(db: DbDep, current_user: CurrentUser):
    result = await db.execute(select(Asset).order_by(Asset.created_at.desc()))
    return [_asset_response(a) for a in result.scalars()]


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(body: AssetCreate, db: DbDep, current_user: CurrentUser):
    data = body.model_dump()
    if data.get("ssh_password"):
        data["ssh_password"] = encrypt(data["ssh_password"])
    if data.get("ssh_key"):
        data["ssh_key"] = encrypt(data["ssh_key"])
    if data.get("sudo_password"):
        data["sudo_password"] = encrypt(data["sudo_password"])
    asset = Asset(**data)
    db.add(asset)
    await db.flush()
    await db.refresh(asset)
    return _asset_response(asset)


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(asset_id: str, db: DbDep, current_user: CurrentUser):
    result = await db.execute(select(Asset).where(Asset.id == uuid.UUID(asset_id)))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_response(asset)


@router.patch("/{asset_id}", response_model=AssetResponse)
async def update_asset(asset_id: str, body: dict, db: DbDep, current_user: CurrentUser):
    result = await db.execute(select(Asset).where(Asset.id == uuid.UUID(asset_id)))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    allowed_fields = {"hostname", "ip_address", "os_type", "os_version", "tags", "credential_vault_path", "ssh_username", "ssh_port", "sudo_method"}
    for k, v in body.items():
        if k in allowed_fields:
            setattr(asset, k, v)

    # Encrypt sensitive fields before storing
    if "ssh_password" in body:
        asset.ssh_password = encrypt(body["ssh_password"]) if body["ssh_password"] else None
    if "ssh_key" in body:
        asset.ssh_key = encrypt(body["ssh_key"]) if body["ssh_key"] else None
    if "sudo_password" in body:
        asset.sudo_password = encrypt(body["sudo_password"]) if body["sudo_password"] else None

    await db.flush()
    await db.refresh(asset)
    return _asset_response(asset)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(asset_id: str, db: DbDep, _admin: AdminUser):
    uid = uuid.UUID(asset_id)
    result = await db.execute(select(Asset).where(Asset.id == uid))
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Delete dependent rows that reference this asset
    await db.execute(sa_delete(Finding).where(Finding.asset_id == uid))
    await db.execute(sa_delete(TimelineEvent).where(TimelineEvent.asset_id == uid))

    # Delete hunt executions linked to sessions for this asset
    session_ids_q = select(Session.id).where(Session.asset_id == uid)
    await db.execute(sa_delete(HuntExecution).where(HuntExecution.session_id.in_(session_ids_q)))
    await db.execute(sa_delete(Session).where(Session.asset_id == uid))

    await db.delete(asset)
