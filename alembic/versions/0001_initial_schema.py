"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums ─────────────────────────────────────────────────────────────────
    # ── assets ────────────────────────────────────────────────────────────────
    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("hostname", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("os_type", sa.Enum("linux", "windows", "macos", "unknown", name="ostype"), nullable=False, server_default="unknown"),
        sa.Column("os_version", sa.String(128)),
        sa.Column("platform_metadata", postgresql.JSONB),
        sa.Column("credential_vault_path", sa.String(512)),
        sa.Column("tags", postgresql.ARRAY(sa.String)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(timezone=True)),
    )

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(128), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("role", sa.Enum("analyst", "admin", name="userrole"), nullable=False, server_default="analyst"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
    )

    # ── sessions ──────────────────────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("analyst_id", sa.String(128), nullable=False),
        sa.Column("state", sa.Enum("INITIALIZING","CONNECTING","CONNECTED","RUNNING","PAUSED","LOCKED","DISCONNECTED","FAILED","TERMINATED", name="sessionstate"), nullable=False, server_default="INITIALIZING"),
        sa.Column("mode", sa.Enum("ai", "interactive", name="sessionmode"), nullable=False, server_default="ai"),
        sa.Column("locked_by", sa.String(128)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("metadata", postgresql.JSONB),
    )

    # ── hunt_executions ───────────────────────────────────────────────────────
    op.create_table(
        "hunt_executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("module_id", sa.String(128), nullable=False),
        sa.Column("state", sa.Enum("PENDING","RUNNING","COMPLETED","FAILED","CANCELLED", name="huntstate"), nullable=False, server_default="PENDING"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("observations", postgresql.JSONB),
    )

    # ── findings ──────────────────────────────────────────────────────────────
    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("hunt_execution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hunt_executions.id")),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("severity", sa.Enum("critical","high","medium","low","info", name="severity"), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False, index=True),
        sa.Column("stix_bundle", postgresql.JSONB),
        sa.Column("first_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("sighting_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("remediation", postgresql.JSONB),
        sa.Column("status", sa.Enum("open","acknowledged","resolved", name="findingstatus"), nullable=False, server_default="open"),
    )

    # ── timeline_events ───────────────────────────────────────────────────────
    op.create_table(
        "timeline_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id")),
        sa.Column("event_type", sa.String(128), nullable=False),
        sa.Column("payload", postgresql.JSONB),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("analyst_id", sa.String(128), nullable=False),
    )

    # Indexes (ix_findings_content_hash already created by index=True on the column)
    op.create_index("ix_findings_asset_id", "findings", ["asset_id"])
    op.create_index("ix_timeline_asset_id", "timeline_events", ["asset_id"])
    op.create_index("ix_sessions_asset_id", "sessions", ["asset_id"])


def downgrade() -> None:
    op.drop_table("timeline_events")
    op.drop_table("findings")
    op.drop_table("hunt_executions")
    op.drop_table("sessions")
    op.drop_table("users")
    op.drop_table("assets")

    op.execute("DROP TYPE IF EXISTS findingstatus")
    op.execute("DROP TYPE IF EXISTS severity")
    op.execute("DROP TYPE IF EXISTS huntstate")
    op.execute("DROP TYPE IF EXISTS sessionmode")
    op.execute("DROP TYPE IF EXISTS sessionstate")
    op.execute("DROP TYPE IF EXISTS ostype")
    op.execute("DROP TYPE IF EXISTS userrole")
