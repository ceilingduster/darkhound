"""add asset credential columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("ssh_username", sa.String(128), nullable=True))
    op.add_column("assets", sa.Column("ssh_password", sa.Text, nullable=True))
    op.add_column("assets", sa.Column("ssh_key", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "ssh_key")
    op.drop_column("assets", "ssh_password")
    op.drop_column("assets", "ssh_username")
