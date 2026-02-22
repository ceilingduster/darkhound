from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class OsType(str, enum.Enum):
    linux = "linux"
    windows = "windows"
    macos = "macos"
    unknown = "unknown"


class SessionState(str, enum.Enum):
    INITIALIZING = "INITIALIZING"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    LOCKED = "LOCKED"
    DISCONNECTED = "DISCONNECTED"
    FAILED = "FAILED"
    TERMINATED = "TERMINATED"


class SessionMode(str, enum.Enum):
    ai = "ai"
    interactive = "interactive"


class HuntState(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Severity(str, enum.Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class FindingStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"


class UserRole(str, enum.Enum):
    analyst = "analyst"
    admin = "admin"


# ── Models ────────────────────────────────────────────────────────────────────

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    os_type: Mapped[OsType] = mapped_column(Enum(OsType), default=OsType.unknown)
    os_version: Mapped[str | None] = mapped_column(String(128))
    platform_metadata: Mapped[dict | None] = mapped_column(JSONB)
    credential_vault_path: Mapped[str | None] = mapped_column(String(512))
    ssh_username: Mapped[str | None] = mapped_column(String(128))
    ssh_password: Mapped[str | None] = mapped_column(Text)
    ssh_key: Mapped[str | None] = mapped_column(Text)
    ssh_port: Mapped[int | None] = mapped_column(Integer)
    sudo_method: Mapped[str | None] = mapped_column(String(16))
    sudo_password: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list[Session]] = relationship("Session", back_populates="asset")
    findings: Mapped[list[Finding]] = relationship("Finding", back_populates="asset")
    timeline_events: Mapped[list[TimelineEvent]] = relationship("TimelineEvent", back_populates="asset")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    analyst_id: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[SessionState] = mapped_column(Enum(SessionState), default=SessionState.INITIALIZING)
    mode: Mapped[SessionMode] = mapped_column(Enum(SessionMode), default=SessionMode.ai)
    locked_by: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB)

    asset: Mapped[Asset] = relationship("Asset", back_populates="sessions")
    hunt_executions: Mapped[list[HuntExecution]] = relationship("HuntExecution", back_populates="session")
    findings: Mapped[list[Finding]] = relationship("Finding", back_populates="session")
    timeline_events: Mapped[list[TimelineEvent]] = relationship("TimelineEvent", back_populates="session")


class HuntExecution(Base):
    __tablename__ = "hunt_executions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    module_id: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[HuntState] = mapped_column(Enum(HuntState), default=HuntState.PENDING)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observations: Mapped[list | None] = mapped_column(JSONB)
    ai_report_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    session: Mapped[Session] = relationship("Session", back_populates="hunt_executions")
    findings: Mapped[list[Finding]] = relationship("Finding", back_populates="hunt_execution")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    hunt_execution_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hunt_executions.id")
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[Severity] = mapped_column(Enum(Severity), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    stix_bundle: Mapped[dict | None] = mapped_column(JSONB)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sighting_count: Mapped[int] = mapped_column(Integer, default=1)
    remediation: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[FindingStatus] = mapped_column(Enum(FindingStatus), default=FindingStatus.open)

    session: Mapped[Session] = relationship("Session", back_populates="findings")
    asset: Mapped[Asset] = relationship("Asset", back_populates="findings")
    hunt_execution: Mapped[HuntExecution | None] = relationship("HuntExecution", back_populates="findings")


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id"))
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    analyst_id: Mapped[str] = mapped_column(String(128), nullable=False)

    asset: Mapped[Asset] = relationship("Asset", back_populates="timeline_events")
    session: Mapped[Session | None] = relationship("Session", back_populates="timeline_events")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.analyst)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
