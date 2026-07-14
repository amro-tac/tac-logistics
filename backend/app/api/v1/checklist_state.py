import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, get_current_tenant_id
from app.models.shipment import Shipment
from app.models.checklist import ChecklistItem
from app.models.user import User

router = APIRouter(prefix="/shipments", tags=["checklist"])


async def _assert_access(shipment_id: uuid.UUID, tenant_id: uuid.UUID, db: AsyncSession):
    result = await db.execute(
        select(Shipment).where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shipment not found")


@router.get("/{shipment_id}/checklist")
async def get_checklist_state(
    shipment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Returns the list of checked item IDs for this shipment."""
    await _assert_access(shipment_id, tenant_id, db)
    result = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.shipment_id == shipment_id,
            ChecklistItem.tenant_id == tenant_id,
        )
    )
    items = result.scalars().all()
    return [i.item_id for i in items]


@router.post("/{shipment_id}/checklist/{item_id}", status_code=status.HTTP_201_CREATED)
async def check_item(
    shipment_id: uuid.UUID,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a checklist item as done (idempotent)."""
    await _assert_access(shipment_id, user.tenant_id, db)
    existing = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.shipment_id == shipment_id,
            ChecklistItem.tenant_id == user.tenant_id,
            ChecklistItem.item_id == item_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(ChecklistItem(shipment_id=shipment_id, tenant_id=user.tenant_id, item_id=item_id))
        await db.commit()
    return {"item_id": item_id, "done": True}


@router.delete("/{shipment_id}/checklist/{item_id}", status_code=204)
async def uncheck_item(
    shipment_id: uuid.UUID,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Mark a checklist item as not done."""
    await _assert_access(shipment_id, tenant_id, db)
    await db.execute(
        delete(ChecklistItem).where(
            ChecklistItem.shipment_id == shipment_id,
            ChecklistItem.tenant_id == tenant_id,
            ChecklistItem.item_id == item_id,
        )
    )
    await db.commit()
