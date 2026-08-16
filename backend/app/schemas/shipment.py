from datetime import datetime
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel

from app.models.shipment import ShipmentStatus, ClearancePath, RiskFlag, ContainerType
from app.models.tracking import TrackingEventType, TrackingSource


# ── Containers ────────────────────────────────────────────────────────────────

class ContainerIn(BaseModel):
    container_number: Optional[str] = None
    container_type: Optional[ContainerType] = None
    seal_number: Optional[str] = None
    cbm: Optional[float] = None
    gross_weight_kg: Optional[float] = None
    commodity: Optional[str] = None


class ContainerOut(ContainerIn):
    id: UUID
    shipment_id: UUID

    class Config:
        from_attributes = True


class CommoditySearchResult(BaseModel):
    shipment_id: UUID
    reference: str
    status: ShipmentStatus
    vessel_name: Optional[str]
    port_of_loading: Optional[str]
    port_of_discharge: Optional[str]
    eta: Optional[datetime]
    container_number: Optional[str]
    container_type: Optional[str]
    commodity: Optional[str]
    bl_number: Optional[str]

    class Config:
        from_attributes = True


# ── Tracking events ───────────────────────────────────────────────────────────

class TrackingEventOut(BaseModel):
    id: UUID
    event_type: TrackingEventType
    event_time: datetime
    location: Optional[str]
    description: Optional[str]
    eta_at_time: Optional[datetime]
    source: TrackingSource

    class Config:
        from_attributes = True


# ── Shipment ──────────────────────────────────────────────────────────────────

class ShipmentCreate(BaseModel):
    """Fields needed to open a Draft."""
    supplier_id: Optional[UUID] = None
    clearance_path: ClearancePath = ClearancePath.DIRECT_PA
    notes: Optional[str] = None


class BulkShipmentCreate(BaseModel):
    """Create one Draft per B/L, auto-detecting the carrier from the prefix."""
    bl_numbers: list[str]
    clearance_path: ClearancePath = ClearancePath.DIRECT_PA


class BulkShipmentResultItem(BaseModel):
    bl_number: str
    outcome: Literal["created", "skipped_duplicate", "invalid"]
    shipment_id: Optional[UUID] = None
    reference: Optional[str] = None
    carrier_name: Optional[str] = None      # detected carrier (None if not recognised)
    carrier_matched: bool = False           # True if we linked it to a carrier record


class BulkShipmentResult(BaseModel):
    created: int
    skipped: int
    invalid: int
    items: list[BulkShipmentResultItem]


class ShipmentBook(BaseModel):
    """Fields needed to advance Draft → Booked."""
    carrier_id: UUID
    bl_number: str
    vessel_name: Optional[str] = None
    voyage_number: Optional[str] = None
    port_of_loading: str
    port_of_discharge: str = "Haifa"
    etd: datetime
    eta: datetime
    containers: list[ContainerIn] = []


class ShipmentUpdate(BaseModel):
    supplier_id: Optional[UUID] = None
    carrier_id: Optional[UUID] = None
    clearance_path: Optional[ClearancePath] = None
    bl_number: Optional[str] = None
    vessel_name: Optional[str] = None
    voyage_number: Optional[str] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    etd: Optional[datetime] = None
    eta: Optional[datetime] = None
    atd: Optional[datetime] = None
    tracking_only: Optional[bool] = None
    notes: Optional[str] = None


class ShipmentOut(BaseModel):
    id: UUID
    reference: str
    status: ShipmentStatus
    clearance_path: ClearancePath
    risk_flag: RiskFlag
    carrier_id: Optional[UUID]
    carrier_name: Optional[str] = None
    carrier_free_days: Optional[int] = None
    bl_number: Optional[str]
    vessel_name: Optional[str]
    voyage_number: Optional[str]
    port_of_loading: Optional[str]
    port_of_discharge: Optional[str]
    etd: Optional[datetime]
    atd: Optional[datetime]
    eta: Optional[datetime]
    ata: Optional[datetime]
    eta_last_updated: Optional[datetime]
    tracking_active: bool
    tracking_only: bool = False
    notes: Optional[str]
    shipsgo_shipment_id: Optional[int] = None
    route_geojson: Optional[str] = None
    current_leg_from: Optional[str] = None
    current_leg_from_at: Optional[datetime] = None
    current_leg_to: Optional[str] = None
    current_leg_to_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    containers: list[ContainerOut] = []
    tracking_events: list[TrackingEventOut] = []

    class Config:
        from_attributes = True


class ShipmentListItem(BaseModel):
    id: UUID
    reference: str
    status: ShipmentStatus
    risk_flag: RiskFlag
    bl_number: Optional[str]
    vessel_name: Optional[str]
    port_of_loading: Optional[str]
    port_of_discharge: Optional[str]
    etd: Optional[datetime]
    eta: Optional[datetime]
    atd: Optional[datetime]
    ata: Optional[datetime]
    tracking_active: bool
    route_geojson: Optional[str] = None
    current_leg_from: Optional[str] = None
    current_leg_to: Optional[str] = None
    created_at: datetime
    containers: list[ContainerOut] = []

    class Config:
        from_attributes = True
