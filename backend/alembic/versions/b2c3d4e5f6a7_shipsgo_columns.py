"""Add ShipsGo tracking columns to shipments

Real voyage data + route from ShipsGo (ported from the Amigo fork):
the shipment's ShipsGo id, its cached GeoJSON route, and the current leg
(port-to-port the ship is actually on) for accurate map placement.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-16
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("shipsgo_shipment_id", sa.Integer()),
    ("route_geojson", sa.Text()),
    ("current_leg_from", sa.String()),
    ("current_leg_from_at", sa.DateTime()),
    ("current_leg_to", sa.String()),
    ("current_leg_to_at", sa.DateTime()),
]


def upgrade() -> None:
    for name, coltype in _COLUMNS:
        op.add_column("shipments", sa.Column(name, coltype, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("shipments", name)
