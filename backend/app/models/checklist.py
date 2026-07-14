import uuid
from sqlalchemy import Column, String, Uuid, ForeignKey, DateTime
from app.models.base import Base, utcnow


class ChecklistItem(Base):
    """One row per checked item per shipment."""
    __tablename__ = "checklist_items"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    item_id = Column(String, nullable=False)
    done_at = Column(DateTime, default=utcnow, nullable=False)
