from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shipment import Shipment, ShipmentStatus, RiskFlag
from app.models.tracking import TrackingEvent, TrackingEventType, TrackingSource


# Which transitions are allowed
VALID_TRANSITIONS: dict[ShipmentStatus, list[ShipmentStatus]] = {
    ShipmentStatus.DRAFT:      [ShipmentStatus.BOOKED],
    ShipmentStatus.BOOKED:     [ShipmentStatus.IN_TRANSIT],
    ShipmentStatus.IN_TRANSIT: [ShipmentStatus.AT_PORT],
    ShipmentStatus.AT_PORT:    [ShipmentStatus.CUSTOMS],
    ShipmentStatus.CUSTOMS:    [ShipmentStatus.RELEASED],
    ShipmentStatus.RELEASED:   [ShipmentStatus.RECEIVED],
    ShipmentStatus.RECEIVED:   [ShipmentStatus.CLOSED],
    ShipmentStatus.CLOSED:     [],
}

# Fields that must be set before entering a stage
REQUIRED_FIELDS: dict[ShipmentStatus, list[str]] = {
    ShipmentStatus.BOOKED:     ["carrier_id", "bl_number", "eta"],
    ShipmentStatus.IN_TRANSIT: ["atd"],
    ShipmentStatus.AT_PORT:    ["ata"],
}

# Tracking events that automatically advance the shipment stage
EVENT_TRIGGERS: dict[TrackingEventType, ShipmentStatus] = {
    TrackingEventType.VESSEL_DEPARTED: ShipmentStatus.IN_TRANSIT,
    TrackingEventType.VESSEL_ARRIVED:  ShipmentStatus.AT_PORT,
}


class StateMachineError(Exception):
    pass


def can_transition(shipment: Shipment, new_status: ShipmentStatus) -> bool:
    return new_status in VALID_TRANSITIONS.get(shipment.status, [])


async def transition(
    shipment: Shipment,
    new_status: ShipmentStatus,
    db: AsyncSession,
    actor: Optional[str] = None,
) -> None:
    if not can_transition(shipment, new_status):
        raise StateMachineError(
            f"Cannot move from '{shipment.status}' to '{new_status}'"
        )

    missing = [
        f for f in REQUIRED_FIELDS.get(new_status, [])
        if not getattr(shipment, f, None)
    ]
    if missing:
        raise StateMachineError(
            f"Missing required fields to reach '{new_status}': {missing}"
        )

    shipment.status = new_status
    db.add(shipment)


async def apply_tracking_event(
    shipment: Shipment,
    event_type: TrackingEventType,
    event_time: datetime,
    db: AsyncSession,
    location: Optional[str] = None,
    new_eta: Optional[datetime] = None,
    raw_payload: Optional[str] = None,
    container_id=None,
) -> TrackingEvent:
    """
    Process an incoming tracking event:
    - record it in tracking_events
    - update ETA if it changed
    - auto-advance shipment stage if the event triggers one
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Update ETA if the carrier reports a new one
    if new_eta and new_eta != shipment.eta:
        shipment.eta = new_eta
        shipment.eta_last_updated = now

    # Set actual dates when milestone events arrive
    if event_type == TrackingEventType.VESSEL_DEPARTED and not shipment.atd:
        shipment.atd = event_time

    if event_type == TrackingEventType.VESSEL_ARRIVED and not shipment.ata:
        shipment.ata = event_time

    # Persist the event
    event = TrackingEvent(
        shipment_id=shipment.id,
        container_id=container_id,
        event_type=event_type,
        event_time=event_time,
        location=location,
        eta_at_time=shipment.eta,
        source=TrackingSource.TERMINAL49,
        raw_payload=raw_payload,
    )
    db.add(event)

    # Auto-advance stage if this event triggers a transition
    target_status = EVENT_TRIGGERS.get(event_type)
    if target_status and can_transition(shipment, target_status):
        await transition(shipment, target_status, db)

    db.add(shipment)
    return event


def compute_risk_flag(shipment: Shipment) -> RiskFlag:
    """Recompute the risk flag based on current state and dates."""
    from datetime import timedelta

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if shipment.status in (ShipmentStatus.RECEIVED, ShipmentStatus.CLOSED):
        return RiskFlag.OK

    if not shipment.eta:
        return RiskFlag.OK

    days_to_eta = (shipment.eta - now).days

    if shipment.ata:
        # Vessel is at port — check demurrage window
        carrier_free_days = getattr(shipment.carrier, "default_free_days", 5) if shipment.carrier else 5
        days_at_port = (now - shipment.ata).days
        if days_at_port > carrier_free_days and shipment.status == ShipmentStatus.AT_PORT:
            return RiskFlag.CRITICAL

    if days_to_eta <= 0 and shipment.status in (ShipmentStatus.BOOKED, ShipmentStatus.IN_TRANSIT):
        return RiskFlag.CRITICAL

    if days_to_eta <= 7:
        return RiskFlag.WARNING

    return RiskFlag.OK
