"""
Freight rates — benchmark lanes, quote logging, and shipping estimates.

Benchmarks are seeded per tenant as editable market *estimates* (they are not
a live feed — a paid provider like Freightos/Xeneta could replace them later).
The estimate endpoint combines three signals for a lane:
  1. the benchmark band,
  2. quotes the tenant has logged,
  3. what they actually paid on past shipments (from the landed-cost data).
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_tenant_id
from app.models.finance import ShipmentFinance
from app.models.rates import FreightRate, FreightQuote
from app.models.shipment import Shipment

router = APIRouter(prefix="/rates", tags=["rates"])

CONTAINER_TYPES = ("20GP", "40GP", "40HQ", "reefer")

# Seed lanes to Haifa: (origin, 40GP low, 40GP high, transit min, transit max).
# Editable estimates based on typical market bands — NOT live rates.
SEED_LANES = [
    ("Shanghai / Ningbo, China",   2200, 3800, 28, 38),
    ("Singapore / SE Asia",        2400, 4000, 30, 40),
    ("Nhava Sheva, India",         1500, 2600, 18, 26),
    ("Istanbul / Mersin, Turkey",   700, 1400,  5, 10),
    ("Rotterdam / North Europe",   1400, 2400, 14, 20),
    ("Valencia / West Med",         900, 1700,  8, 14),
    ("Santos, Brazil",             2800, 4600, 30, 42),
    ("New York / US East Coast",   1800, 3200, 22, 30),
]

# Multipliers applied to the 40GP band when seeding other container types
TYPE_FACTOR = {"20GP": 0.8, "40GP": 1.0, "40HQ": 1.05, "reefer": 2.0}


class RateUpdate(BaseModel):
    rate_low_usd: Decimal = Field(ge=0)
    rate_high_usd: Decimal = Field(ge=0)
    transit_days_min: int | None = Field(default=None, ge=0)
    transit_days_max: int | None = Field(default=None, ge=0)


class QuoteIn(BaseModel):
    origin: str
    container_type: str
    provider: str
    price_usd: Decimal = Field(gt=0)
    valid_until: datetime | None = None
    notes: str | None = None


def _rate_out(r: FreightRate) -> dict:
    return {
        "id": str(r.id),
        "origin": r.origin,
        "destination": r.destination,
        "container_type": r.container_type,
        "rate_low_usd": float(r.rate_low_usd),
        "rate_high_usd": float(r.rate_high_usd),
        "transit_days_min": r.transit_days_min,
        "transit_days_max": r.transit_days_max,
    }


def _quote_out(q: FreightQuote) -> dict:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return {
        "id": str(q.id),
        "origin": q.origin,
        "container_type": q.container_type,
        "provider": q.provider,
        "price_usd": float(q.price_usd),
        "valid_until": q.valid_until.isoformat() if q.valid_until else None,
        "expired": bool(q.valid_until and q.valid_until < now),
        "notes": q.notes,
        "created_at": q.created_at.isoformat(),
    }


async def _rates_for_tenant(tenant_id: uuid.UUID, db: AsyncSession) -> list[FreightRate]:
    rates = (await db.execute(
        select(FreightRate).where(FreightRate.tenant_id == tenant_id)
    )).scalars().all()
    if rates:
        return list(rates)

    # First use — seed the benchmark table for this tenant
    for origin, low, high, tmin, tmax in SEED_LANES:
        for ctype in CONTAINER_TYPES:
            f = TYPE_FACTOR[ctype]
            db.add(FreightRate(
                tenant_id=tenant_id,
                origin=origin,
                destination="Haifa",
                container_type=ctype,
                rate_low_usd=round(low * f, -1),
                rate_high_usd=round(high * f, -1),
                transit_days_min=tmin,
                transit_days_max=tmax,
            ))
    await db.commit()
    return list((await db.execute(
        select(FreightRate).where(FreightRate.tenant_id == tenant_id)
    )).scalars().all())


@router.get("")
async def list_rates(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    rates = await _rates_for_tenant(tenant_id, db)
    rates.sort(key=lambda r: (r.origin, CONTAINER_TYPES.index(r.container_type)))
    return [_rate_out(r) for r in rates]


@router.put("/{rate_id}")
async def update_rate(
    rate_id: uuid.UUID,
    body: RateUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    rate = (await db.execute(
        select(FreightRate).where(FreightRate.id == rate_id, FreightRate.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not rate:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rate not found")
    if body.rate_high_usd < body.rate_low_usd:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "High rate must be >= low rate")
    for field, value in body.model_dump().items():
        setattr(rate, field, value)
    await db.commit()
    return _rate_out(rate)


# ── Quotes ────────────────────────────────────────────────────────────────────

@router.get("/quotes")
async def list_quotes(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    quotes = (await db.execute(
        select(FreightQuote).where(FreightQuote.tenant_id == tenant_id)
        .order_by(FreightQuote.created_at.desc()).limit(100)
    )).scalars().all()
    return [_quote_out(q) for q in quotes]


@router.post("/quotes", status_code=status.HTTP_201_CREATED)
async def add_quote(
    body: QuoteIn,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    if body.container_type not in CONTAINER_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown container type")
    quote = FreightQuote(tenant_id=tenant_id, destination="Haifa", **body.model_dump())
    db.add(quote)
    await db.commit()
    return _quote_out(quote)


@router.delete("/quotes/{quote_id}")
async def delete_quote(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    quote = (await db.execute(
        select(FreightQuote).where(FreightQuote.id == quote_id, FreightQuote.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not quote:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quote not found")
    await db.delete(quote)
    await db.commit()
    return {"deleted": True}


# ── Estimate ──────────────────────────────────────────────────────────────────

@router.get("/estimate")
async def estimate(
    origin: str,
    container_type: str = "40HQ",
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Benchmark band + logged quotes + actual paid history for one lane."""
    if container_type not in CONTAINER_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown container type")

    rates = await _rates_for_tenant(tenant_id, db)
    lane_rates = [r for r in rates if r.origin == origin]
    if not lane_rates:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown lane — add it to the benchmark table first")
    by_type = {r.container_type: r for r in lane_rates}
    chosen = by_type.get(container_type)

    quotes = (await db.execute(
        select(FreightQuote).where(
            FreightQuote.tenant_id == tenant_id,
            FreightQuote.origin == origin,
            FreightQuote.container_type == container_type,
        ).order_by(FreightQuote.created_at.desc()).limit(5)
    )).scalars().all()

    # What this tenant actually paid on the lane (landed-cost data).
    # Lane labels are like "Santos, Brazil" — match shipments by the first city token.
    city = origin.split("/")[0].split(",")[0].strip().lower()
    paid_rows = (await db.execute(
        select(Shipment.reference, Shipment.port_of_loading, ShipmentFinance.ocean_freight_usd)
        .join(ShipmentFinance, ShipmentFinance.shipment_id == Shipment.id)
        .where(
            Shipment.tenant_id == tenant_id,
            ShipmentFinance.ocean_freight_usd.isnot(None),
            Shipment.port_of_loading.isnot(None),
        )
        .order_by(Shipment.created_at.desc())
    )).all()
    history = [
        {"reference": ref, "port_of_loading": pol, "ocean_freight_usd": float(fr)}
        for ref, pol, fr in paid_rows
        if pol and city in pol.lower()
    ][:5]

    return {
        "origin": origin,
        "destination": "Haifa",
        "container_type": container_type,
        "benchmark": _rate_out(chosen) if chosen else None,
        "options": [_rate_out(by_type[t]) for t in CONTAINER_TYPES if t in by_type],
        "quotes": [_quote_out(q) for q in quotes],
        "paid_history": history,
    }
