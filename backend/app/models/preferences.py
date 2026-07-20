import uuid
from sqlalchemy import Column, String, Text, Uuid, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base, utcnow


class CarrierPreference(Base):
    """Preferred shipping line per cargo category, e.g. frozen fish → ZIM.

    Applied when booking: typing a matching commodity suggests (and
    pre-selects) the preferred carrier.
    """
    __tablename__ = "carrier_preferences"
    __table_args__ = (UniqueConstraint("tenant_id", "category", name="uq_carrier_pref_tenant_category"),)

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)

    category = Column(String, nullable=False)   # frozen_fish | meat | furniture | home_products | textiles | produce | other
    carrier_id = Column(Uuid(as_uuid=True), ForeignKey("carriers.id"), nullable=False)
    note = Column(Text)                         # why, e.g. "best reefer plugs + cold chain record"

    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    carrier = relationship("Carrier", foreign_keys=[carrier_id])
