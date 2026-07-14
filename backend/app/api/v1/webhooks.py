"""
Terminal49 webhook receiver.

Terminal49 sends a POST to /api/v1/webhooks/terminal49 whenever a tracking
event occurs. We map their event types to our TrackingEventType, persist the
event, and auto-advance the shipment stage if applicable.

Terminal49 event reference:
  https://terminal49.com/docs/api/webhooks
"""
import hashlib
import hmac
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.shipment import Shipment, ShipmentStatus
from app.models.tracking import TrackingEventType
from app.core.state_machine import apply_tracking_event, compute_risk_flag

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Terminal49 event → our TrackingEventType
T49_EVENT_MAP: dict[str, TrackingEventType] = {
    "transport.vessel_departed":   TrackingEventType.VESSEL_DEPARTED,
    "transport.vessel_arrived":    TrackingEventType.VESSEL_ARRIVED,
    "transport.transshipment":     TrackingEventType.TRANSSHIPMENT,
    "transport.loaded_on_vessel":  TrackingEventType.LOADED_ON_VESSEL,
    "transport.discharged":        TrackingEventType.DISCHARGED,
    "transport.gate_in":           TrackingEventType.GATE_IN,
    "transport.gate_out":          TrackingEventType.GATE_OUT,
    "transport.eta_updated":       TrackingEventType.ETA_UPDATE,
    "transport.delay":             TrackingEventType.DELAY,
}


def _verify_signature(payload: bytes, signature: str) -> bool:
    """Verify Terminal49 HMAC-SHA256 webhook signature."""
    expected = hmac.new(
        settings.TERMINAL49_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/terminal49")
async def terminal49_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_terminal49_signature: str = Header(default=""),
):
    raw = await request.body()

    if settings.TERMINAL49_WEBHOOK_SECRET:
        if not _verify_signature(raw, x_terminal49_signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_name: str = payload.get("event", "")
    data: dict = payload.get("data", {})

    event_type = T49_EVENT_MAP.get(event_name)
    if not event_type:
        # Unknown event — acknowledge but ignore
        return {"status": "ignored", "event": event_name}

    # Find the shipment by Terminal49 shipment ID or BL number
    t49_id = data.get("shipment_id")
    bl_number = data.get("bill_of_lading")

    query = select(Shipment).where(
        Shipment.status.not_in([ShipmentStatus.RECEIVED, ShipmentStatus.CLOSED])
    )
    if t49_id:
        query = query.where(Shipment.terminal49_shipment_id == t49_id)
    elif bl_number:
        query = query.where(Shipment.bl_number == bl_number)
    else:
        return {"status": "ignored", "reason": "no shipment identifier in payload"}

    result = await db.execute(query)
    shipment = result.scalar_one_or_none()
    if not shipment:
        return {"status": "ignored", "reason": "shipment not found"}

    # Parse event details
    event_time = datetime.fromisoformat(
        data.get("timestamp", datetime.now(timezone.utc).isoformat())
    ).replace(tzinfo=None)

    new_eta_raw = data.get("estimated_arrival")
    new_eta = datetime.fromisoformat(new_eta_raw).replace(tzinfo=None) if new_eta_raw else None

    await apply_tracking_event(
        shipment=shipment,
        event_type=event_type,
        event_time=event_time,
        db=db,
        location=data.get("location"),
        new_eta=new_eta,
        raw_payload=json.dumps(payload),
    )

    # Recompute risk flag after every event
    shipment.risk_flag = compute_risk_flag(shipment)
    db.add(shipment)

    await db.commit()
    return {"status": "ok"}
