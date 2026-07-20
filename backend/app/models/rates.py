import uuid
from sqlalchemy import Column, String, Integer, Numeric, Text, Uuid, ForeignKey, DateTime
from app.models.base import Base, utcnow


class FreightRate(Base):
    """Benchmark ocean-freight rate for one lane + container type.

    Seeded per tenant with editable market estimates — a reference band for
    judging quotes, not a live market feed.
    """
    __tablename__ = "freight_rates"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)

    origin = Column(String, nullable=False)              # e.g. "Santos, Brazil"
    destination = Column(String, nullable=False, default="Haifa")
    container_type = Column(String, nullable=False)      # 20GP | 40GP | 40HQ | reefer

    rate_low_usd = Column(Numeric(10, 0), nullable=False)
    rate_high_usd = Column(Numeric(10, 0), nullable=False)
    transit_days_min = Column(Integer)
    transit_days_max = Column(Integer)

    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class FreightQuote(Base):
    """A quote received from a forwarder/carrier, logged for comparison."""
    __tablename__ = "freight_quotes"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)

    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False, default="Haifa")
    container_type = Column(String, nullable=False)
    provider = Column(String, nullable=False)            # forwarder / carrier name
    price_usd = Column(Numeric(10, 0), nullable=False)
    valid_until = Column(DateTime)
    notes = Column(Text)

    created_at = Column(DateTime, default=utcnow, nullable=False)
