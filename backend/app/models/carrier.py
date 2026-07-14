import uuid
from sqlalchemy import Column, String, Integer, Uuid
from app.models.base import Base


class Carrier(Base):
    """Carriers are global (not tenant-scoped) — ZIM is ZIM for everyone."""
    __tablename__ = "carriers"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    scac = Column(String, unique=True)
    default_free_days = Column(Integer, default=5)
    terminal49_carrier_id = Column(String)
