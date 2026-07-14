import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, get_current_tenant_id
from app.models.shipment import Shipment
from app.models.note import ShipmentNote
from app.models.user import User

router = APIRouter(prefix="/shipments", tags=["notes"])


async def _assert_access(shipment_id: uuid.UUID, tenant_id: uuid.UUID, db: AsyncSession):
    result = await db.execute(
        select(Shipment).where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shipment not found")


class NoteIn(BaseModel):
    text: str


@router.get("/{shipment_id}/notes")
async def list_notes(
    shipment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    await _assert_access(shipment_id, tenant_id, db)
    result = await db.execute(
        select(ShipmentNote)
        .where(ShipmentNote.shipment_id == shipment_id, ShipmentNote.tenant_id == tenant_id)
        .order_by(ShipmentNote.created_at.desc())
    )
    notes = result.scalars().all()
    return [{"id": str(n.id), "text": n.text, "createdAt": n.created_at.isoformat()} for n in notes]


@router.post("/{shipment_id}/notes", status_code=status.HTTP_201_CREATED)
async def create_note(
    shipment_id: uuid.UUID,
    body: NoteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _assert_access(shipment_id, user.tenant_id, db)
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="Note text cannot be empty")
    note = ShipmentNote(shipment_id=shipment_id, tenant_id=user.tenant_id, text=body.text.strip())
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return {"id": str(note.id), "text": note.text, "createdAt": note.created_at.isoformat()}


@router.delete("/{shipment_id}/notes/{note_id}", status_code=204)
async def delete_note(
    shipment_id: uuid.UUID,
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(ShipmentNote).where(
            ShipmentNote.id == note_id,
            ShipmentNote.shipment_id == shipment_id,
            ShipmentNote.tenant_id == tenant_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.commit()
