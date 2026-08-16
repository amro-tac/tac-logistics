"""Add tracking_only flag to shipments

When a third party handles clearance end-to-end, skip document/checklist
requirements and their alerts while keeping position/ETA tracking.
(Kept as a flag rather than adopting the full
clearance-path removal.)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "shipments",
        sa.Column("tracking_only", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("shipments", "tracking_only")
