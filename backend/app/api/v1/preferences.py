import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_tenant_id
from app.models.carrier import Carrier
from app.models.preferences import CarrierPreference

router = APIRouter(prefix="/carrier-preferences", tags=["preferences"])

CATEGORIES = ("frozen_fish", "meat", "furniture", "home_products", "textiles", "produce", "other")


class PreferenceIn(BaseModel):
    carrier_id: uuid.UUID
    note: str | None = None


def _out(p: CarrierPreference) -> dict:
    return {
        "category": p.category,
        "carrier_id": str(p.carrier_id),
        "carrier_name": p.carrier.name if p.carrier else None,
        "note": p.note,
    }


@router.get("")
async def list_preferences(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    prefs = (await db.execute(
        select(CarrierPreference)
        .where(CarrierPreference.tenant_id == tenant_id)
        .options(selectinload(CarrierPreference.carrier))
    )).scalars().all()
    return [_out(p) for p in prefs]


@router.put("/{category}")
async def upsert_preference(
    category: str,
    body: PreferenceIn,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    if category not in CATEGORIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown category '{category}'")
    carrier = (await db.execute(
        select(Carrier).where(Carrier.id == body.carrier_id)
    )).scalar_one_or_none()
    if not carrier:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carrier not found")

    pref = (await db.execute(
        select(CarrierPreference).where(
            CarrierPreference.tenant_id == tenant_id,
            CarrierPreference.category == category,
        )
    )).scalar_one_or_none()
    if not pref:
        pref = CarrierPreference(tenant_id=tenant_id, category=category)
        db.add(pref)
    pref.carrier_id = body.carrier_id
    pref.note = body.note
    await db.commit()

    pref = (await db.execute(
        select(CarrierPreference)
        .where(CarrierPreference.tenant_id == tenant_id, CarrierPreference.category == category)
        .options(selectinload(CarrierPreference.carrier))
    )).scalar_one()
    return _out(pref)


@router.delete("/{category}")
async def delete_preference(
    category: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    pref = (await db.execute(
        select(CarrierPreference).where(
            CarrierPreference.tenant_id == tenant_id,
            CarrierPreference.category == category,
        )
    )).scalar_one_or_none()
    if not pref:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No preference for this category")
    await db.delete(pref)
    await db.commit()
    return {"deleted": True}
