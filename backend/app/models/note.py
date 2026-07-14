import uuid
from sqlalchemy import Column, String, Text, Uuid, ForeignKey, DateTime
from app.models.base import Base, TenantScoped, utcnow


class ShipmentNote(Base):
    __tablename__ = "shipment_notes"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
