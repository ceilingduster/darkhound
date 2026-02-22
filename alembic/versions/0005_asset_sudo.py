"""Add sudo_method and sudo_password to assets

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("sudo_method", sa.String(16), nullable=True))
    op.add_column("assets", sa.Column("sudo_password", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("assets", "sudo_password")
    op.drop_column("assets", "sudo_method")
