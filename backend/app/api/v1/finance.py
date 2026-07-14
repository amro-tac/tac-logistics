import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_tenant_id
from app.models.shipment import Shipment
from app.models.finance import ShipmentFinance, ShipmentPayment, ShipmentOrderItem, PaymentKind

router = APIRouter(prefix="/shipments", tags=["finance"])


async def _assert_access(shipment_id: uuid.UUID, tenant_id: uuid.UUID, db: AsyncSession):
    result = await db.execute(
        select(Shipment).where(Shipment.id == shipment_id, Shipment.tenant_id == tenant_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shipment not found")


# ── Schemas ───────────────────────────────────────────────────────────────────

class FinanceIn(BaseModel):
    order_number: str | None = None
    total_value_usd: Decimal | None = Field(default=None, ge=0)
    payment_terms: str | None = None
    downpayment_pct: Decimal | None = Field(default=None, ge=0, le=100)
    shipment_window: str | None = None


class PaymentIn(BaseModel):
    amount_usd: Decimal = Field(gt=0)
    kind: PaymentKind = PaymentKind.OTHER
    method: str | None = "TT"
    reference: str | None = None
    note: str | None = None
    paid_at: datetime | None = None


class OrderItemIn(BaseModel):
    code: str | None = None
    description: str
    quantity_mt: Decimal | None = Field(default=None, ge=0)
    unit_price_usd: Decimal | None = Field(default=None, ge=0)
    expiry: str | None = None


# ── Serializers ───────────────────────────────────────────────────────────────

def _num(v) -> float | None:
    return float(v) if v is not None else None


def _payment_out(p: ShipmentPayment) -> dict:
    return {
        "id": str(p.id),
        "amount_usd": float(p.amount_usd),
        "kind": p.kind.value,
        "method": p.method,
        "reference": p.reference,
        "note": p.note,
        "paid_at": p.paid_at.isoformat(),
    }


def _item_out(i: ShipmentOrderItem) -> dict:
    line_total = (
        float(i.quantity_mt) * float(i.unit_price_usd)
        if i.quantity_mt is not None and i.unit_price_usd is not None
        else None
    )
    return {
        "id": str(i.id),
        "code": i.code,
        "description": i.description,
        "quantity_mt": _num(i.quantity_mt),
        "unit_price_usd": _num(i.unit_price_usd),
        "line_total_usd": line_total,
        "expiry": i.expiry,
    }


async def _finance_payload(shipment_id: uuid.UUID, tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    finance = (await db.execute(
        select(ShipmentFinance).where(
            ShipmentFinance.shipment_id == shipment_id,
            ShipmentFinance.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()

    payments = (await db.execute(
        select(ShipmentPayment)
        .where(ShipmentPayment.shipment_id == shipment_id, ShipmentPayment.tenant_id == tenant_id)
        .order_by(ShipmentPayment.paid_at)
    )).scalars().all()

    items = (await db.execute(
        select(ShipmentOrderItem)
        .where(ShipmentOrderItem.shipment_id == shipment_id, ShipmentOrderItem.tenant_id == tenant_id)
        .order_by(ShipmentOrderItem.created_at)
    )).scalars().all()

    total = _num(finance.total_value_usd) if finance else None
    paid = round(sum(float(p.amount_usd) for p in payments), 2)
    balance = round(total - paid, 2) if total is not None else None

    if paid <= 0:
        payment_status = "unpaid"
    elif total is not None and paid >= total - 0.005:
        payment_status = "paid"
    else:
        payment_status = "partial"

    return {
        "order_number": finance.order_number if finance else None,
        "total_value_usd": total,
        "payment_terms": finance.payment_terms if finance else None,
        "downpayment_pct": _num(finance.downpayment_pct) if finance else None,
        "shipment_window": finance.shipment_window if finance else None,
        "paid_usd": paid,
        "balance_usd": balance,
        "payment_status": payment_status,
        "payments": [_payment_out(p) for p in payments],
        "items": [_item_out(i) for i in items],
    }


# ── Finance header ────────────────────────────────────────────────────────────

@router.get("/{shipment_id}/finance")
async def get_finance(
    shipment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    await _assert_access(shipment_id, tenant_id, db)
    return await _finance_payload(shipment_id, tenant_id, db)


@router.put("/{shipment_id}/finance")
async def upsert_finance(
    shipment_id: uuid.UUID,
    body: FinanceIn,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    await _assert_access(shipment_id, tenant_id, db)
    finance = (await db.execute(
        select(ShipmentFinance).where(
            ShipmentFinance.shipment_id == shipment_id,
            ShipmentFinance.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if not finance:
        finance = ShipmentFinance(shipment_id=shipment_id, tenant_id=tenant_id)
        db.add(finance)
    for field, value in body.model_dump().items():
        setattr(finance, field, value)
    await db.commit()
    return await _finance_payload(shipment_id, tenant_id, db)


# ── Payments ──────────────────────────────────────────────────────────────────

@router.post("/{shipment_id}/payments", status_code=status.HTTP_201_CREATED)
async def add_payment(
    shipment_id: uuid.UUID,
    body: PaymentIn,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    await _assert_access(shipment_id, tenant_id, db)
    payment = ShipmentPayment(
        shipment_id=shipment_id,
        tenant_id=tenant_id,
        amount_usd=body.amount_usd,
        kind=body.kind,
        method=body.method,
        reference=body.reference,
        note=body.note,
        **({"paid_at": body.paid_at} if body.paid_at else {}),
    )
    db.add(payment)
    await db.commit()
    return await _finance_payload(shipment_id, tenant_id, db)


@router.delete("/{shipment_id}/payments/{payment_id}")
async def delete_payment(
    shipment_id: uuid.UUID,
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    payment = (await db.execute(
        select(ShipmentPayment).where(
            ShipmentPayment.id == payment_id,
            ShipmentPayment.shipment_id == shipment_id,
            ShipmentPayment.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    await db.delete(payment)
    await db.commit()
    return await _finance_payload(shipment_id, tenant_id, db)


# ── Order items ───────────────────────────────────────────────────────────────

@router.post("/{shipment_id}/order-items", status_code=status.HTTP_201_CREATED)
async def add_order_item(
    shipment_id: uuid.UUID,
    body: OrderItemIn,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    await _assert_access(shipment_id, tenant_id, db)
    if not body.description.strip():
        raise HTTPException(status_code=422, detail="Description cannot be empty")
    item = ShipmentOrderItem(
        shipment_id=shipment_id,
        tenant_id=tenant_id,
        code=body.code,
        description=body.description.strip(),
        quantity_mt=body.quantity_mt,
        unit_price_usd=body.unit_price_usd,
        expiry=body.expiry,
    )
    db.add(item)
    await db.commit()
    return await _finance_payload(shipment_id, tenant_id, db)


@router.delete("/{shipment_id}/order-items/{item_id}")
async def delete_order_item(
    shipment_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    item = (await db.execute(
        select(ShipmentOrderItem).where(
            ShipmentOrderItem.id == item_id,
            ShipmentOrderItem.shipment_id == shipment_id,
            ShipmentOrderItem.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    await db.delete(item)
    await db.commit()
    return await _finance_payload(shipment_id, tenant_id, db)
