"""Add document_waivers table

Revision ID: a1b2c3d4e5f6
Revises: f3a4b5c6d7e8
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_waivers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("shipment_id", sa.Uuid(), sa.ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("shipment_id", "category", name="uq_doc_waiver_shipment_category"),
    )


def downgrade() -> None:
    op.drop_table("document_waivers")
