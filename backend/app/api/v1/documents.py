"""
Shipment document storage — metadata in DB, files on disk.
Files are stored at: uploads/{tenant_id}/{shipment_id}/{doc_id}_{filename}
"""
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, get_current_tenant_id
from app.doc_requirements import DOC_CATEGORIES, categories_for, required_categories
from app.models.shipment import Shipment
from app.models.document import ShipmentDocument, DocumentWaiver
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["documents"])

UPLOAD_ROOT = Path("uploads")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


async def _get_shipment(shipment_id: str, tenant_id: uuid.UUID, db: AsyncSession) -> Shipment:
    result = await db.execute(
        select(Shipment).where(
            Shipment.id == uuid.UUID(shipment_id),
            Shipment.tenant_id == tenant_id,
        )
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


class WaiveIn(BaseModel):
    note: str | None = None


async def _build_checklist(shipment: Shipment, tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    # Tracking-only shipments have no compliance requirements.
    if getattr(shipment, "tracking_only", False):
        return {"items": [], "required": 0, "present": 0, "waived": 0, "missing": [], "tracking_only": True}
    commodities = [c.commodity for c in shipment.containers]
    cats = categories_for(commodities)
    required = required_categories(shipment.clearance_path.value, cats)

    docs = (await db.execute(
        select(ShipmentDocument.category).where(ShipmentDocument.shipment_id == shipment.id)
    )).scalars().all()
    uploaded_counts: dict[str, int] = {}
    for cat in docs:
        uploaded_counts[cat] = uploaded_counts.get(cat, 0) + 1

    waivers = (await db.execute(
        select(DocumentWaiver.category).where(DocumentWaiver.shipment_id == shipment.id)
    )).scalars().all()
    waived = set(waivers)

    items = [
        {
            "category": cat,
            "uploaded": uploaded_counts.get(cat, 0) > 0,
            "uploaded_count": uploaded_counts.get(cat, 0),
            "waived": cat in waived,
        }
        for cat in required
    ]
    # Applicable = required minus waived; present = uploaded & applicable
    applicable = [it for it in items if not it["waived"]]
    present = sum(1 for it in applicable if it["uploaded"])
    missing = [it["category"] for it in applicable if not it["uploaded"]]
    return {
        "items": items,
        "required": len(applicable),
        "present": present,
        "waived": len(items) - len(applicable),
        "missing": missing,
    }


@router.get("/{shipment_id}/checklist")
async def document_checklist(
    shipment_id: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Required documents for this shipment: uploaded / missing / N/A."""
    result = await db.execute(
        select(Shipment)
        .where(Shipment.id == uuid.UUID(shipment_id), Shipment.tenant_id == tenant_id)
        .options(selectinload(Shipment.containers))
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return await _build_checklist(shipment, tenant_id, db)


@router.put("/{shipment_id}/waive/{category}")
async def waive_document(
    shipment_id: str,
    category: str,
    body: WaiveIn = WaiveIn(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mark a required document as not-applicable for this shipment."""
    if category not in DOC_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"'{category}' is not a required document category")
    await _get_shipment(shipment_id, user.tenant_id, db)

    existing = (await db.execute(
        select(DocumentWaiver).where(
            DocumentWaiver.shipment_id == uuid.UUID(shipment_id),
            DocumentWaiver.category == category,
        )
    )).scalar_one_or_none()
    if existing:
        existing.note = body.note
    else:
        db.add(DocumentWaiver(
            shipment_id=uuid.UUID(shipment_id),
            tenant_id=user.tenant_id,
            category=category,
            note=body.note,
        ))
    await db.commit()
    return {"waived": True, "category": category}


@router.delete("/{shipment_id}/waive/{category}")
async def unwaive_document(
    shipment_id: str,
    category: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Restore a previously N/A'd document to the required list."""
    waiver = (await db.execute(
        select(DocumentWaiver).where(
            DocumentWaiver.shipment_id == uuid.UUID(shipment_id),
            DocumentWaiver.category == category,
            DocumentWaiver.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if not waiver:
        raise HTTPException(status_code=404, detail="No waiver for this category")
    await db.delete(waiver)
    await db.commit()
    return {"waived": False, "category": category}


@router.get("/{shipment_id}")
async def list_documents(
    shipment_id: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    await _get_shipment(shipment_id, tenant_id, db)
    result = await db.execute(
        select(ShipmentDocument)
        .where(
            ShipmentDocument.shipment_id == uuid.UUID(shipment_id),
            ShipmentDocument.tenant_id == tenant_id,
        )
        .order_by(ShipmentDocument.uploaded_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "category": d.category,
            "size": d.size,
            "mime_type": d.mime_type,
            "uploaded_at": d.uploaded_at.isoformat(),
        }
        for d in docs
    ]


@router.post("/{shipment_id}")
async def upload_document(
    shipment_id: str,
    file: UploadFile = File(...),
    category: str = Form(default="other"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id
    await _get_shipment(shipment_id, tenant_id, db)

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE // (1024*1024)} MB)")

    doc_id = uuid.uuid4()
    safe_name = Path(file.filename or "document").name.replace("..", "").replace("/", "")
    dest_dir = UPLOAD_ROOT / str(tenant_id) / shipment_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = dest_dir / f"{doc_id}_{safe_name}"
    file_path.write_bytes(contents)

    doc = ShipmentDocument(
        id=doc_id,
        shipment_id=uuid.UUID(shipment_id),
        tenant_id=tenant_id,
        name=safe_name,
        category=category,
        size=len(contents),
        mime_type=file.content_type or "application/octet-stream",
        file_path=str(file_path),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": str(doc.id),
        "name": doc.name,
        "category": doc.category,
        "size": doc.size,
        "mime_type": doc.mime_type,
        "uploaded_at": doc.uploaded_at.isoformat(),
    }


@router.get("/{shipment_id}/{doc_id}/download")
async def download_document(
    shipment_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(ShipmentDocument).where(
            ShipmentDocument.id == uuid.UUID(doc_id),
            ShipmentDocument.shipment_id == uuid.UUID(shipment_id),
            ShipmentDocument.tenant_id == tenant_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File missing from disk")

    return FileResponse(path=file_path, filename=doc.name, media_type=doc.mime_type or "application/octet-stream")


@router.delete("/{shipment_id}/{doc_id}", status_code=204)
async def delete_document(
    shipment_id: str,
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    result = await db.execute(
        select(ShipmentDocument).where(
            ShipmentDocument.id == uuid.UUID(doc_id),
            ShipmentDocument.shipment_id == uuid.UUID(shipment_id),
            ShipmentDocument.tenant_id == tenant_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    Path(doc.file_path).unlink(missing_ok=True)
    await db.delete(doc)
    await db.commit()
