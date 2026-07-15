import enum
import uuid
from sqlalchemy import Column, String, Enum, ForeignKey, DateTime, Numeric, Boolean, Text, Uuid
from sqlalchemy.orm import relationship
from app.models.base import TenantScoped, Base


class ShipmentStatus(str, enum.Enum):
    DRAFT = "draft"
    BOOKED = "booked"
    IN_TRANSIT = "in_transit"
    AT_PORT = "at_port"
    CUSTOMS = "customs"
    RELEASED = "released"
    RECEIVED = "received"
    CLOSED = "closed"


class ClearancePath(str, enum.Enum):
    DIRECT_PA = "direct_pa"
    ISRAELI_ONLY = "israeli_only"


class RiskFlag(str, enum.Enum):
    OK = "ok"
    WARNING = "warning"
    CRITICAL = "critical"
    BLOCKED = "blocked"


class ContainerType(str, enum.Enum):
    TWENTY_GP = "20GP"
    FORTY_GP = "40GP"
    FORTY_HQ = "40HQ"
    REEFER = "reefer"


class Shipment(TenantScoped):
    __tablename__ = "shipments"

    reference = Column(String, nullable=False)
    status = Column(Enum(ShipmentStatus), default=ShipmentStatus.DRAFT, nullable=False, index=True)
    clearance_path = Column(Enum(ClearancePath), default=ClearancePath.DIRECT_PA, nullable=False)
    risk_flag = Column(Enum(RiskFlag), default=RiskFlag.OK, nullable=False)

    supplier_id = Column(Uuid(as_uuid=True), ForeignKey("suppliers.id"))
    carrier_id = Column(Uuid(as_uuid=True), ForeignKey("carriers.id"))

    bl_number = Column(String, index=True)
    vessel_name = Column(String)
    voyage_number = Column(String)
    port_of_loading = Column(String)
    port_of_discharge = Column(String, default="Haifa")

    etd = Column(DateTime)
    atd = Column(DateTime)
    eta = Column(DateTime)
    ata = Column(DateTime)
    eta_last_updated = Column(DateTime)

    tracking_active = Column(Boolean, default=False, nullable=False)
    terminal49_shipment_id = Column(String)
    notes = Column(Text)

    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    carrier = relationship("Carrier", foreign_keys=[carrier_id])
    containers = relationship("Container", back_populates="shipment", cascade="all, delete-orphan")
    tracking_events = relationship(
        "TrackingEvent",
        back_populates="shipment",
        order_by="TrackingEvent.event_time",
        cascade="all, delete-orphan",
    )

    # Convenience fields for the API — read from the eager-loaded carrier so the
    # demurrage card knows the real free-time allowance (varies by carrier).
    @property
    def carrier_name(self) -> str | None:
        return self.carrier.name if self.carrier else None

    @property
    def carrier_free_days(self) -> int | None:
        return self.carrier.default_free_days if self.carrier else None


class Container(Base):
    __tablename__ = "containers"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id = Column(Uuid(as_uuid=True), ForeignKey("shipments.id"), nullable=False, index=True)
    container_number = Column(String, index=True)
    container_type = Column(Enum(ContainerType))
    seal_number = Column(String)
    cbm = Column(Numeric(10, 3))
    gross_weight_kg = Column(Numeric(10, 2))
    commodity = Column(String)

    shipment = relationship("Shipment", back_populates="containers")
