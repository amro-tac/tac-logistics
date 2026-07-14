"""shipment finance, payments, order items

Revision ID: c4d5e6f7a8b9
Revises: 98ea30571ac9
Create Date: 2026-07-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = '98ea30571ac9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'shipment_finance',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shipment_id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('order_number', sa.String(), nullable=True),
        sa.Column('total_value_usd', sa.Numeric(12, 2), nullable=True),
        sa.Column('payment_terms', sa.Text(), nullable=True),
        sa.Column('downpayment_pct', sa.Numeric(5, 2), nullable=True),
        sa.Column('shipment_window', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('shipment_id'),
    )
    op.create_index(op.f('ix_shipment_finance_shipment_id'), 'shipment_finance', ['shipment_id'])
    op.create_index(op.f('ix_shipment_finance_tenant_id'), 'shipment_finance', ['tenant_id'])

    op.create_table(
        'shipment_payments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shipment_id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('amount_usd', sa.Numeric(12, 2), nullable=False),
        sa.Column('kind', sa.Enum('DOWNPAYMENT', 'BALANCE', 'OTHER', name='paymentkind'), nullable=False),
        sa.Column('method', sa.String(), nullable=True),
        sa.Column('reference', sa.String(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shipment_payments_shipment_id'), 'shipment_payments', ['shipment_id'])
    op.create_index(op.f('ix_shipment_payments_tenant_id'), 'shipment_payments', ['tenant_id'])

    op.create_table(
        'shipment_order_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shipment_id', sa.Uuid(), nullable=False),
        sa.Column('tenant_id', sa.Uuid(), nullable=False),
        sa.Column('code', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('quantity_mt', sa.Numeric(10, 3), nullable=True),
        sa.Column('unit_price_usd', sa.Numeric(12, 2), nullable=True),
        sa.Column('expiry', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shipment_order_items_shipment_id'), 'shipment_order_items', ['shipment_id'])
    op.create_index(op.f('ix_shipment_order_items_tenant_id'), 'shipment_order_items', ['tenant_id'])


def downgrade() -> None:
    op.drop_table('shipment_order_items')
    op.drop_table('shipment_payments')
    op.drop_table('shipment_finance')
