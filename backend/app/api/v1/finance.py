import uuid
from decimal import Decimal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_tenant_id
from app.models.shipment import Shipment
from app.models.supplier import Supplier
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
    ocean_freight_usd: Decimal | None = Field(default=None, ge=0)
    local_charges_usd: Decimal | None = Field(default=None, ge=0)
    customs_duty_usd: Decimal | None = Field(default=None, ge=0)
    demurrage_usd: Decimal | None = Field(default=None, ge=0)
    other_costs_usd: Decimal | None = Field(default=None, ge=0)


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

    # Import / shipping costs → landed cost (cargo value + costs to move & clear it)
    cost_fields = ["ocean_freight_usd", "local_charges_usd", "customs_duty_usd",
                   "demurrage_usd", "other_costs_usd"]
    costs = {f: (_num(getattr(finance, f)) if finance else None) for f in cost_fields}
    import_costs = round(sum(v for v in costs.values() if v is not None), 2)
    has_costs = any(v is not None for v in costs.values())
    landed = round((total or 0) + import_costs, 2) if (total is not None or has_costs) else None

    return {
        "order_number": finance.order_number if finance else None,
        "total_value_usd": total,
        "payment_terms": finance.payment_terms if finance else None,
        "downpayment_pct": _num(finance.downpayment_pct) if finance else None,
        "shipment_window": finance.shipment_window if finance else None,
        "paid_usd": paid,
        "balance_usd": balance,
        "payment_status": payment_status,
        **costs,
        "import_costs_usd": import_costs,
        "landed_cost_usd": landed,
        "payments": [_payment_out(p) for p in payments],
        "items": [_item_out(i) for i in items],
    }


# ── Cashflow: what's owed to suppliers, and when ──────────────────────────────

@router.get("/reports/cashflow")
async def cashflow(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Orders (shipments with an order value) and their outstanding payments.

    Payment schedule from the standard terms: a downpayment is due before
    production; the balance is due against the B/L copy (i.e. once booked).
    """
    rows = (await db.execute(
        select(ShipmentFinance, Shipment, Supplier)
        .join(Shipment, Shipment.id == ShipmentFinance.shipment_id)
        .join(Supplier, Supplier.id == Shipment.supplier_id, isouter=True)
        .where(
            ShipmentFinance.tenant_id == tenant_id,
            ShipmentFinance.total_value_usd.isnot(None),
        )
    )).all()

    pay_rows = (await db.execute(
        select(ShipmentPayment.shipment_id, ShipmentPayment.amount_usd)
        .where(ShipmentPayment.tenant_id == tenant_id)
    )).all()
    paid_by: dict = {}
    for sid, amt in pay_rows:
        paid_by[sid] = paid_by.get(sid, 0.0) + float(amt)

    orders = []
    total_outstanding = 0.0
    dp_due_count = dp_due_amt = 0
    bal_due_count = bal_due_amt = 0.0

    for fin, ship, sup in rows:
        total = float(fin.total_value_usd)
        paid = round(paid_by.get(ship.id, 0.0), 2)
        outstanding = round(max(0.0, total - paid), 2)
        pct = float(fin.downpayment_pct) if fin.downpayment_pct is not None else None
        dp_amt = round(total * pct / 100, 2) if pct else None
        status = ship.status.value
        is_draft = status == "draft"

        obligation = None
        if outstanding > 0.005:
            if dp_amt and paid < dp_amt - 0.005:
                obligation = {
                    "kind": "downpayment",
                    "amount": round(dp_amt - paid, 2),
                    "due_now": True,
                    "due_hint": "before production",
                }
            else:
                obligation = {
                    "kind": "balance",
                    "amount": outstanding,
                    "due_now": not is_draft,
                    "due_hint": "now — B/L issued" if not is_draft else "on B/L",
                }

        payment_status = "paid" if outstanding <= 0.005 else ("partial" if paid > 0 else "unpaid")

        orders.append({
            "shipment_id": str(ship.id),
            "reference": ship.reference,
            "order_number": fin.order_number,
            "supplier_name": sup.name if sup else None,
            "status": status,
            "eta": ship.eta.isoformat() if ship.eta else None,
            "total_usd": total,
            "paid_usd": paid,
            "outstanding_usd": outstanding,
            "payment_status": payment_status,
            "obligation": obligation,
        })

        total_outstanding += outstanding
        if obligation and obligation["kind"] == "downpayment":
            dp_due_count += 1
            dp_due_amt += obligation["amount"]
        elif obligation and obligation["due_now"]:
            bal_due_count += 1
            bal_due_amt += obligation["amount"]

    def _rank(o):
        ob = o["obligation"]
        eta = o["eta"] or "9999"
        if not ob:
            return (3, eta)
        if ob["kind"] == "downpayment":
            return (0, eta)
        if ob["due_now"]:
            return (1, eta)
        return (2, eta)

    orders.sort(key=_rank)

    return {
        "total_outstanding_usd": round(total_outstanding, 2),
        "downpayments_due": {"count": dp_due_count, "amount": round(dp_due_amt, 2)},
        "balances_due": {"count": bal_due_count, "amount": round(bal_due_amt, 2)},
        "order_count": len(orders),
        "orders": orders,
    }


# ── Tenant-wide cost summary (for Analytics) ──────────────────────────────────

@router.get("/reports/cost-summary")
async def cost_summary(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """Totals across all shipments: cargo value, carrier/import costs, landed cost."""
    F = ShipmentFinance
    row = (await db.execute(
        select(
            func.coalesce(func.sum(F.total_value_usd), 0),
            func.coalesce(func.sum(F.ocean_freight_usd), 0),
            func.coalesce(func.sum(F.local_charges_usd), 0),
            func.coalesce(func.sum(F.customs_duty_usd), 0),
            func.coalesce(func.sum(F.demurrage_usd), 0),
            func.coalesce(func.sum(F.other_costs_usd), 0),
        ).where(F.tenant_id == tenant_id)
    )).one()

    cargo, freight, local, customs, demurrage, other = (float(v) for v in row)
    # Carrier fees = what goes to the shipping line and port (excludes govt duties).
    carrier_fees = round(freight + local + demurrage, 2)
    import_costs = round(freight + local + customs + demurrage + other, 2)

    # How many shipments have any cost recorded
    with_costs = (await db.execute(
        select(func.count()).where(
            F.tenant_id == tenant_id,
            (F.ocean_freight_usd.isnot(None)) | (F.local_charges_usd.isnot(None))
            | (F.customs_duty_usd.isnot(None)) | (F.demurrage_usd.isnot(None))
            | (F.other_costs_usd.isnot(None)),
        )
    )).scalar_one()

    return {
        "cargo_value_usd": round(cargo, 2),
        "ocean_freight_usd": round(freight, 2),
        "local_charges_usd": round(local, 2),
        "customs_duty_usd": round(customs, 2),
        "demurrage_usd": round(demurrage, 2),
        "other_costs_usd": round(other, 2),
        "carrier_fees_usd": carrier_fees,
        "import_costs_usd": import_costs,
        "landed_cost_usd": round(cargo + import_costs, 2),
        "shipments_with_costs": with_costs,
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
    # Only update fields the caller actually sent, so a partial save (e.g. just
    # the freight cost) doesn't wipe the order value or other fields.
    for field, value in body.model_dump(exclude_unset=True).items():
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
