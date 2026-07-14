import enum
import uuid
from sqlalchemy import Column, String, Enum, ForeignKey, DateTime, Text, Uuid
from sqlalchemy.orm import relationship
from app.models.base import Base


class TrackingEventType(str, enum.Enum):
    BOOKING_CONFIRMED = "booking_confirmed"
    GATE_IN = "gate_in"
    LOADED_ON_VESSEL = "loaded_on_vessel"
    VESSEL_DEPARTED = "vessel_departed"
    TRANSSHIPMENT = "transshipment"
    VESSEL_ARRIVED = "vessel_arrived"
    DISCHARGED = "discharged"
    GATE_OUT = "gate_out"
    ETA_UPDATE = "eta_update"
    DELAY = "delay"
    MANUAL = "manual"


class TrackingSource(str, enum.Enum):
    TERMINAL49 = "terminal49"
    MANUAL = "manual"


class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id"), nullable=False, index=True)
    container_id = Column(Uuid(as_uuid=True), ForeignKey("containers.id"), nullable=True)

    event_type = Column(Enum(TrackingEventType), nullable=False)
    event_time = Column(DateTime, nullable=False)
    location = Column(String)
    description = Column(Text)
    eta_at_time = Column(DateTime)
    source = Column(Enum(TrackingSource), default=TrackingSource.MANUAL, nullable=False)
    raw_payload = Column(Text)

    shipment = relationship("Shipment", back_populates="tracking_events")
