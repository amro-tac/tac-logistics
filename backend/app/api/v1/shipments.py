import json
import logging
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_current_tenant_id
from app.models.shipment import Shipment, ShipmentStatus, Container
from app.models.tracking import TrackingEvent, TrackingEventType, TrackingSource
from app.models.user import User
from app.schemas.shipment import (
    ShipmentCreate, ShipmentBook, ShipmentUpdate,
    ShipmentOut, ShipmentListItem, CommoditySearchResult,
)
from pydantic import BaseModel

log = logging.getLogger(__name__)


class AdvanceRequest(BaseModel):
    status: ShipmentStatus
from app.core.state_machine import transition, compute_risk_flag, StateMachineError, VALID_TRANSITIONS

router = APIRouter(prefix="/shipments", tags=["shipments"])


def _generate_reference(tenant_id: UUID) -> str:
    from datetime import date
    import random, string
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"SHP-{date.today().year}-{suffix}"


def _load_options():
    return (
        selectinload(Shipment.containers),
        selectinload(Shipment.tracking_events),
        selectinload(Shipment.carrier),
    )


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ShipmentListItem])
async def list_shipments(
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(Shipment)
        .where(Shipment.tenant_id == tenant_id)
        .options(selectinload(Shipment.containers))
        .order_by(Shipment.created_at.desc())
    )
    return result.scalars().all()


# ── Commodity search ──────────────────────────────────────────────────────────

@router.get("/search/commodity", response_model=list[CommoditySearchResult])
async def search_by_commodity(
    q: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    from sqlalchemy import or_, func
    term = f"%{q.strip()}%"
    result = await db.execute(
        select(Shipment, Container)
        .join(Container, Container.shipment_id == Shipment.id, isouter=True)
        .where(
            Shipment.tenant_id == tenant_id,
            or_(
                func.lower(Container.commodity).like(func.lower(term)),
                func.lower(Shipment.notes).like(func.lower(term)),
            )
        )
        .order_by(Shipment.created_at.desc())
    )
    rows = result.all()
    out = []
    for shipment, container in rows:
        out.append(CommoditySearchResult(
            shipment_id=shipment.id,
            reference=shipment.reference,
            status=shipment.status,
            vessel_name=shipment.vessel_name,
            port_of_loading=shipment.port_of_loading,
            port_of_discharge=shipment.port_of_discharge,
            eta=shipment.eta,
            bl_number=shipment.bl_number,
            container_number=container.container_number if container else None,
            container_type=container.container_type.value if container and container.container_type else None,
            commodity=container.commodity if container else None,
        ))
    return out


# ── Create draft ──────────────────────────────────────────────────────────────

@router.post("", response_model=ShipmentOut, status_code=status.HTTP_201_CREATED)
async def create_shipment(
    body: ShipmentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    shipment = Shipment(
        tenant_id=user.tenant_id,
        reference=_generate_reference(user.tenant_id),
        supplier_id=body.supplier_id,
        clearance_path=body.clearance_path,
        notes=body.notes,
    )
    db.add(shipment)
    await db.commit()
    result = await db.execute(
        select(Shipment).options(*_load_options()).where(Shipment.id == shipment.id)
    )
    return result.scalar_one()


# ── Get detail ────────────────────────────────────────────────────────────────

@router.get("/{shipment_id}", response_model=ShipmentOut)
async def get_shipment(
    shipment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(Shipment)
        .options(*_load_options())
        .where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


# ── Update (while in Draft) ───────────────────────────────────────────────────

@router.patch("/{shipment_id}", response_model=ShipmentOut)
async def update_shipment(
    shipment_id: UUID,
    body: ShipmentUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(Shipment)
        .options(*_load_options())
        .where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    updates = body.model_dump(exclude_unset=True)
    orig_etd = shipment.etd
    orig_eta = shipment.eta

    for field, value in updates.items():
        setattr(shipment, field, value)

    # Recalculate ETA when ATD is set but ETA wasn't explicitly changed
    if "atd" in updates and "eta" not in updates and shipment.atd and orig_etd and orig_eta:
        transit = orig_eta - orig_etd
        shipment.eta = shipment.atd + transit

    await db.commit()
    result = await db.execute(
        select(Shipment).options(*_load_options()).where(Shipment.id == shipment.id)
    )
    return result.scalar_one()


# ── Advance: Draft → Booked ───────────────────────────────────────────────────

@router.post("/{shipment_id}/book", response_model=ShipmentOut)
async def book_shipment(
    shipment_id: UUID,
    body: ShipmentBook,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(Shipment)
        .options(*_load_options())
        .where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # Apply booking details
    shipment.carrier_id = body.carrier_id
    shipment.bl_number = body.bl_number
    shipment.vessel_name = body.vessel_name
    shipment.voyage_number = body.voyage_number
    shipment.port_of_loading = body.port_of_loading
    shipment.port_of_discharge = body.port_of_discharge
    shipment.etd = body.etd
    shipment.eta = body.eta

    # Add containers
    for c in body.containers:
        db.add(Container(shipment_id=shipment.id, **c.model_dump()))

    try:
        await transition(shipment, ShipmentStatus.BOOKED, db)
    except StateMachineError as e:
        raise HTTPException(status_code=422, detail=str(e))

    ship_id = shipment.id
    await db.commit()

    # Register with Terminal49 for automatic push tracking (best-effort, non-blocking)
    if body.bl_number and settings.TERMINAL49_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.terminal49.com/v2/trackings",
                    headers={
                        "Authorization": f"Token {settings.TERMINAL49_API_KEY}",
                        "Content-Type": "application/vnd.api+json",
                        "Accept": "application/vnd.api+json",
                    },
                    json={
                        "data": {
                            "type": "tracking",
                            "attributes": {
                                "bill_of_lading_number": body.bl_number,
                                "request_type": "bl",
                            },
                        }
                    },
                )
                if resp.is_success:
                    t49_id = resp.json().get("data", {}).get("id")
                    if t49_id:
                        await db.execute(
                            update(Shipment)
                            .where(Shipment.id == ship_id)
                            .values(terminal49_shipment_id=t49_id, tracking_active=True)
                        )
                        await db.commit()
        except Exception:
            log.warning("Terminal49 registration failed for B/L %s — tracking will be manual", body.bl_number)

    result = await db.execute(
        select(Shipment)
        .options(*_load_options())
        .where(Shipment.id == ship_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


# ── Manual stage advance ─────────────────────────────────────────────────────

@router.post("/{shipment_id}/advance", response_model=ShipmentOut)
async def advance_shipment(
    shipment_id: UUID,
    body: AdvanceRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(Shipment)
        .options(*_load_options())
        .where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Auto-fill timestamps and recalculate ETA from actual departure
    if body.status == ShipmentStatus.IN_TRANSIT and not shipment.atd:
        if shipment.etd and shipment.eta:
            transit = shipment.eta - shipment.etd
            shipment.eta = now + transit
        shipment.atd = now
    if body.status == ShipmentStatus.AT_PORT and not shipment.ata:
        shipment.ata = now

    try:
        await transition(shipment, body.status, db)
    except StateMachineError as e:
        raise HTTPException(status_code=422, detail=str(e))

    shipment.risk_flag = compute_risk_flag(shipment)
    await db.commit()
    result = await db.execute(
        select(Shipment).options(*_load_options()).where(Shipment.id == shipment.id)
    )
    return result.scalar_one()


# ── Tracking events (manual entry fallback) ───────────────────────────────────

@router.get("/{shipment_id}/tracking", response_model=list)
async def get_tracking(
    shipment_id: UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(TrackingEvent)
        .join(Shipment)
        .where(
            TrackingEvent.shipment_id == shipment_id,
            Shipment.tenant_id == tenant_id,
        )
        .order_by(TrackingEvent.event_time)
    )
    return result.scalars().all()
