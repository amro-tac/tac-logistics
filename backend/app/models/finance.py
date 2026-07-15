import enum
import uuid
from sqlalchemy import Column, String, Text, Uuid, ForeignKey, DateTime, Numeric, Enum
from app.models.base import Base, utcnow


class PaymentKind(str, enum.Enum):
    DOWNPAYMENT = "downpayment"
    BALANCE = "balance"
    OTHER = "other"


class ShipmentFinance(Base):
    """Commercial header for a shipment, from the supplier's sales confirmation."""
    __tablename__ = "shipment_finance"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)

    order_number = Column(String)             # e.g. "O/90198-1"
    total_value_usd = Column(Numeric(12, 2))  # cargo/commercial value (owed to supplier)
    payment_terms = Column(Text)              # e.g. "30% TT before production / 70% TT against BL copy"
    downpayment_pct = Column(Numeric(5, 2))   # e.g. 30.00
    shipment_window = Column(String)          # e.g. "Week 27/2026 to 30/2026"

    # ── Import / shipping costs (what you pay the line, port, and customs) ─────
    ocean_freight_usd = Column(Numeric(12, 2))   # ocean freight to the carrier
    local_charges_usd = Column(Numeric(12, 2))   # THC, handling, delivery, port fees
    customs_duty_usd = Column(Numeric(12, 2))    # duties & clearance
    demurrage_usd = Column(Numeric(12, 2))       # demurrage/detention actually incurred
    other_costs_usd = Column(Numeric(12, 2))     # anything else (insurance, inspection…)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class ShipmentPayment(Base):
    __tablename__ = "shipment_payments"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)

    amount_usd = Column(Numeric(12, 2), nullable=False)
    kind = Column(Enum(PaymentKind), default=PaymentKind.OTHER, nullable=False)
    method = Column(String, default="TT")     # TT, L/C, cash…
    reference = Column(String)                # bank/swift reference
    note = Column(Text)
    paid_at = Column(DateTime, default=utcnow, nullable=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)


class ShipmentOrderItem(Base):
    """A product line from the sales confirmation (cut, quantity, price/MT)."""
    __tablename__ = "shipment_order_items"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)

    code = Column(String)                     # supplier product code, e.g. "79667"
    description = Column(String, nullable=False)
    quantity_mt = Column(Numeric(10, 3))
    unit_price_usd = Column(Numeric(12, 2))   # price per MT
    expiry = Column(String)                   # e.g. "24 months"

    created_at = Column(DateTime, default=utcnow, nullable=False)
