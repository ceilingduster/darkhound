from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Base ──────────────────────────────────────────────────────────────────────

class BaseEvent(BaseModel):
    event_type: str
    session_id: str | None = None
    timestamp: datetime = Field(default_factory=_now)


# ── Session Lifecycle ─────────────────────────────────────────────────────────

class SessionCreated(BaseEvent):
    event_type: Literal["session.created"] = "session.created"
    session_id: str
    asset_id: str
    analyst_id: str


class SessionStateChanged(BaseEvent):
    event_type: Literal["session.state_changed"] = "session.state_changed"
    session_id: str
    from_state: str
    to_state: str
    reason: str = ""


class SessionModeChanged(BaseEvent):
    event_type: Literal["session.mode_changed"] = "session.mode_changed"
    session_id: str
    from_mode: str
    to_mode: str


class SessionLocked(BaseEvent):
    event_type: Literal["session.locked"] = "session.locked"
    session_id: str
    locked_by: str


class SessionUnlocked(BaseEvent):
    event_type: Literal["session.unlocked"] = "session.unlocked"
    session_id: str
    unlocked_by: str


class SessionTerminated(BaseEvent):
    event_type: Literal["session.terminated"] = "session.terminated"
    session_id: str
    reason: str = ""


# ── SSH ───────────────────────────────────────────────────────────────────────

class SshConnecting(BaseEvent):
    event_type: Literal["ssh.connecting"] = "ssh.connecting"
    session_id: str
    target_host: str


class SshConnected(BaseEvent):
    event_type: Literal["ssh.connected"] = "ssh.connected"
    session_id: str
    server_fingerprint: str


class SshDisconnected(BaseEvent):
    event_type: Literal["ssh.disconnected"] = "ssh.disconnected"
    session_id: str
    reason: str = ""


class SshError(BaseEvent):
    event_type: Literal["ssh.error"] = "ssh.error"
    session_id: str
    error_code: str
    message: str


class SshCommandStarted(BaseEvent):
    event_type: Literal["ssh.command_started"] = "ssh.command_started"
    session_id: str
    command_id: str
    command: str


class SshCommandOutput(BaseEvent):
    event_type: Literal["ssh.command_output"] = "ssh.command_output"
    session_id: str
    command_id: str
    chunk: str
    stream: Literal["stdout", "stderr"] = "stdout"


class SshCommandCompleted(BaseEvent):
    event_type: Literal["ssh.command_completed"] = "ssh.command_completed"
    session_id: str
    command_id: str
    exit_code: int
    duration_ms: int


# ── Terminal (PTY) ────────────────────────────────────────────────────────────

class TerminalStarted(BaseEvent):
    event_type: Literal["terminal.started"] = "terminal.started"
    session_id: str
    cols: int = 80
    rows: int = 24


class TerminalData(BaseEvent):
    event_type: Literal["terminal.data"] = "terminal.data"
    session_id: str
    data: str  # base64-encoded raw ANSI bytes


class TerminalResize(BaseEvent):
    event_type: Literal["terminal.resize"] = "terminal.resize"
    session_id: str
    cols: int
    rows: int


class TerminalClosed(BaseEvent):
    event_type: Literal["terminal.closed"] = "terminal.closed"
    session_id: str
    reason: str = ""


# ── Hunt ─────────────────────────────────────────────────────────────────────

class HuntStarted(BaseEvent):
    event_type: Literal["hunt.started"] = "hunt.started"
    session_id: str
    hunt_id: str
    module_id: str


class HuntStepStarted(BaseEvent):
    event_type: Literal["hunt.step_started"] = "hunt.step_started"
    session_id: str
    hunt_id: str
    step_id: str
    description: str


class HuntStepCompleted(BaseEvent):
    event_type: Literal["hunt.step_completed"] = "hunt.step_completed"
    session_id: str
    hunt_id: str
    step_id: str
    observations: list[Any] = Field(default_factory=list)


class HuntObservation(BaseEvent):
    event_type: Literal["hunt.observation"] = "hunt.observation"
    session_id: str
    hunt_id: str
    observation_id: str
    data: Any


class HuntCompleted(BaseEvent):
    event_type: Literal["hunt.completed"] = "hunt.completed"
    session_id: str
    hunt_id: str
    findings_count: int = 0


class HuntFailed(BaseEvent):
    event_type: Literal["hunt.failed"] = "hunt.failed"
    session_id: str
    hunt_id: str
    error: str


class HuntCancelled(BaseEvent):
    event_type: Literal["hunt.cancelled"] = "hunt.cancelled"
    session_id: str
    hunt_id: str


# ── AI ────────────────────────────────────────────────────────────────────────

class AiReasoningStarted(BaseEvent):
    event_type: Literal["ai.reasoning_started"] = "ai.reasoning_started"
    session_id: str
    hunt_id: str
    context_summary: str = ""


class AiReasoningChunk(BaseEvent):
    event_type: Literal["ai.reasoning_chunk"] = "ai.reasoning_chunk"
    session_id: str
    hunt_id: str
    chunk: str
    state: Literal["analyzing", "concluding", "generating"] = "analyzing"


class AiReasoningCompleted(BaseEvent):
    event_type: Literal["ai.reasoning_completed"] = "ai.reasoning_completed"
    session_id: str
    hunt_id: str
    summary: str = ""


class AiFindingGenerated(BaseEvent):
    event_type: Literal["ai.finding_generated"] = "ai.finding_generated"
    session_id: str
    hunt_id: str
    finding_id: str
    severity: str
    title: str


class AiStixGenerated(BaseEvent):
    event_type: Literal["ai.stix_generated"] = "ai.stix_generated"
    session_id: str
    finding_id: str
    bundle_id: str


class AiRemediationReady(BaseEvent):
    event_type: Literal["ai.remediation_ready"] = "ai.remediation_ready"
    session_id: str
    finding_id: str
    guidance_summary: str = ""


class AiError(BaseEvent):
    event_type: Literal["ai.error"] = "ai.error"
    session_id: str
    error: str
    retryable: bool = False


# ── MCP Enrichment ────────────────────────────────────────────────────────────

class McpLookupStarted(BaseEvent):
    event_type: Literal["mcp.lookup_started"] = "mcp.lookup_started"
    session_id: str
    finding_id: str
    provider: str
    ioc_type: str
    ioc_value: str


class McpLookupCompleted(BaseEvent):
    event_type: Literal["mcp.lookup_completed"] = "mcp.lookup_completed"
    session_id: str
    finding_id: str
    provider: str
    result_summary: str = ""


class McpLookupFailed(BaseEvent):
    event_type: Literal["mcp.lookup_failed"] = "mcp.lookup_failed"
    session_id: str
    finding_id: str
    provider: str
    error: str


class McpEnrichmentApplied(BaseEvent):
    event_type: Literal["mcp.enrichment_applied"] = "mcp.enrichment_applied"
    session_id: str
    finding_id: str
    enrichment_summary: str = ""


# ── Timeline ──────────────────────────────────────────────────────────────────

class TimelineEventRecorded(BaseEvent):
    event_type: Literal["timeline.event_recorded"] = "timeline.event_recorded"
    asset_id: str
    event_id: str
    event_type_name: str  # mirrors source event_type


class TimelineFindingLinked(BaseEvent):
    event_type: Literal["timeline.finding_linked"] = "timeline.finding_linked"
    asset_id: str
    finding_id: str
    session_id: str


# ── System ────────────────────────────────────────────────────────────────────

class SystemError(BaseEvent):
    event_type: Literal["system.error"] = "system.error"
    session_id: str | None = None
    component: str
    error: str
    severity: Literal["critical", "high", "medium", "low"] = "medium"


class SystemBackpressure(BaseEvent):
    event_type: Literal["system.backpressure"] = "system.backpressure"
    session_id: str
    component: str
    queue_depth: int
    limit: int
