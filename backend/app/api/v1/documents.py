"""
Shipment document storage — metadata in DB, files on disk.
Files are stored at: uploads/{tenant_id}/{shipment_id}/{doc_id}_{filename}
"""
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, get_current_tenant_id
from app.models.shipment import Shipment
from app.models.document import ShipmentDocument
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
