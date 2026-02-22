"""add ai_report_text to hunt_executions

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("hunt_executions", sa.Column("ai_report_text", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("hunt_executions", "ai_report_text")
