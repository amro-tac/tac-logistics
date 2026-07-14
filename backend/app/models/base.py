import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import DeclarativeBase


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class TenantScoped(Base):
    """All business records inherit from this — automatically scoped to a tenant."""
    __abstract__ = True

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(Uuid(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
