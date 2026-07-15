"""Add import/shipping cost columns to shipment_finance

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-07-13

Tracks what is paid to the carrier, port, and customs so each shipment can
show a true landed cost (cargo value + these costs).
"""
from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None

_COLUMNS = [
    "ocean_freight_usd",
    "local_charges_usd",
    "customs_duty_usd",
    "demurrage_usd",
    "other_costs_usd",
]


def upgrade() -> None:
    for col in _COLUMNS:
        op.add_column("shipment_finance", sa.Column(col, sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    for col in reversed(_COLUMNS):
        op.drop_column("shipment_finance", col)
