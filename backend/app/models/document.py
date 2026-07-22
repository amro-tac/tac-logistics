import uuid
from sqlalchemy import Column, String, Integer, Text, Uuid, ForeignKey, DateTime, UniqueConstraint
from app.models.base import Base, utcnow


class ShipmentDocument(Base):
    __tablename__ = "shipment_documents"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, default="other", nullable=False)
    size = Column(Integer, nullable=False)
    mime_type = Column(String)
    file_path = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=utcnow, nullable=False)


class DocumentWaiver(Base):
    """Marks a required document category as not-applicable for one shipment,
    so it stops counting as 'missing'."""
    __tablename__ = "document_waivers"
    __table_args__ = (UniqueConstraint("shipment_id", "category", name="uq_doc_waiver_shipment_category"),)

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    category = Column(String, nullable=False)
    note = Column(Text)
    created_at = Column(DateTime, default=utcnow, nullable=False)
