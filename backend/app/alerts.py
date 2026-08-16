"""
Compute proactive alerts across all of a tenant's shipments.

Pure computation — reads shipments + checklist state and derives:
  - demurrage_overdue  (critical): past free time at the port, charges accruing
  - demurrage_risk     (warning):  free time ends within 2 days
  - checklist_overdue  (critical): pre-arrival items past their due date
  - arriving_soon      (warning):  ETA within 3 days with items still open
  - eta_changed        (warning):  ETA was updated in the last 3 days

The demurrage $ figure uses the same default rate as the DemurrageCard;
it's an estimate, not an invoice.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.doc_requirements import categories_for, required_categories
from app.models.checklist import ChecklistItem
from app.models.document import ShipmentDocument, DocumentWaiver
from app.models.shipment import Shipment, ShipmentStatus

DEFAULT_FREE_DAYS = 5
DEFAULT_DEMURRAGE_RATE = 150  # $/day/container — keep in sync with DemurrageCard

# Mirror of frontend lib/checklist.ts deadlines (id, days before ETA, clearance paths).
# Only what's needed to decide "overdue" — labels/notes stay in the frontend.
CHECKLIST_DEADLINES: list[tuple[str, int, tuple[str, ...]]] = [
    ("pa_permit",       28, ("direct_pa",)),
    ("quota",           28, ("direct_pa",)),
    ("pa_standards",    21, ("direct_pa",)),
    ("bl",              25, ("direct_pa", "israeli_only")),
    ("invoice_packing", 25, ("direct_pa", "israeli_only")),
    ("cert_origin",     20, ("direct_pa", "israeli_only")),
    ("vet_halal",       20, ("direct_pa",)),
    ("lab_results",     14, ("direct_pa",)),
    ("ins_form",        10, ("direct_pa", "israeli_only")),
    ("reshimon",         7, ("direct_pa", "israeli_only")),
    ("port_release",     5, ("direct_pa", "israeli_only")),
    ("kerem_booking",    5, ("direct_pa",)),
    ("pa_tax_stamp",     3, ("direct_pa",)),
    ("arrival_notice",   3, ("direct_pa", "israeli_only")),
    ("mgmt_signoff",     2, ("direct_pa", "israeli_only")),
]

# Statuses where pre-arrival work and demurrage still matter
ACTIVE_STATUSES = (
    ShipmentStatus.BOOKED,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.AT_PORT,
    ShipmentStatus.CUSTOMS,
)


def _days(delta_seconds: float) -> int:
    return int(delta_seconds // 86400)


async def compute_alerts(tenant_id, db: AsyncSession) -> list[dict]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    shipments = (await db.execute(
        select(Shipment)
        .where(Shipment.tenant_id == tenant_id, Shipment.status.in_(ACTIVE_STATUSES))
        .options(selectinload(Shipment.carrier), selectinload(Shipment.containers))
    )).scalars().all()

    if not shipments:
        return []

    # Done checklist items for these shipments, grouped per shipment
    done_rows = (await db.execute(
        select(ChecklistItem.shipment_id, ChecklistItem.item_id).where(
            ChecklistItem.shipment_id.in_([s.id for s in shipments])
        )
    )).all()
    done: dict = {}
    for sid, item_id in done_rows:
        done.setdefault(sid, set()).add(item_id)

    ship_ids = [s.id for s in shipments]
    # Uploaded doc categories per shipment
    doc_rows = (await db.execute(
        select(ShipmentDocument.shipment_id, ShipmentDocument.category)
        .where(ShipmentDocument.shipment_id.in_(ship_ids))
    )).all()
    uploaded_cats: dict = {}
    for sid, cat in doc_rows:
        uploaded_cats.setdefault(sid, set()).add(cat)
    # Waived (N/A) categories per shipment
    waiver_rows = (await db.execute(
        select(DocumentWaiver.shipment_id, DocumentWaiver.category)
        .where(DocumentWaiver.shipment_id.in_(ship_ids))
    )).all()
    waived_cats: dict = {}
    for sid, cat in waiver_rows:
        waived_cats.setdefault(sid, set()).add(cat)

    alerts: list[dict] = []

    def add(shipment: Shipment, kind: str, level: str, message: str):
        alerts.append({
            "shipment_id": str(shipment.id),
            "reference": shipment.reference,
            "bl_number": shipment.bl_number,
            "kind": kind,
            "level": level,
            "message": message,
        })

    for s in shipments:
        free_days = (s.carrier.default_free_days if s.carrier else None) or DEFAULT_FREE_DAYS
        containers = len(s.containers) or 1

        # ── Demurrage: overdue / approaching ──────────────────────────────────
        if s.ata:
            elapsed = _days((now - s.ata).total_seconds())
            days_over = elapsed - free_days
            if days_over > 0:
                accrued = days_over * DEFAULT_DEMURRAGE_RATE * containers
                add(s, "demurrage_overdue", "critical",
                    f"{days_over} day{'s' if days_over != 1 else ''} over free time — "
                    f"~${accrued:,.0f} demurrage accruing")
            elif free_days - elapsed <= 2:
                left = free_days - elapsed
                add(s, "demurrage_risk", "warning",
                    "Free time ends today — clear the container now" if left == 0
                    else f"Free time ends in {left} day{'s' if left != 1 else ''}")

        # Tracking-only shipments skip all compliance alerts (docs/checklist).
        compliance = not getattr(s, "tracking_only", False)

        # ── Checklist vs ETA ──────────────────────────────────────────────────
        if compliance and s.eta and not s.ata:
            days_to_eta = (s.eta - now).total_seconds() / 86400
            done_ids = done.get(s.id, set())
            path = s.clearance_path.value
            open_items = [
                (item_id, days_before)
                for item_id, days_before, paths in CHECKLIST_DEADLINES
                if path in paths and item_id not in done_ids
            ]
            overdue = [i for i, days_before in open_items if days_to_eta < days_before]
            if overdue:
                add(s, "checklist_overdue", "critical",
                    f"{len(overdue)} pre-arrival item{'s' if len(overdue) != 1 else ''} overdue "
                    f"(ETA {s.eta:%-d %b})")
            elif open_items and 0 <= days_to_eta <= 3:
                add(s, "arriving_soon", "warning",
                    f"Arrives in {int(days_to_eta)}d with {len(open_items)} item"
                    f"{'s' if len(open_items) != 1 else ''} still open")

        # ── Missing required documents before arrival ─────────────────────────
        if compliance and s.eta and not s.ata:
            days_to_eta = (s.eta - now).total_seconds() / 86400
            cats = categories_for([c.commodity for c in s.containers])
            required = required_categories(s.clearance_path.value, cats)
            missing = [
                c for c in required
                if c not in uploaded_cats.get(s.id, set()) and c not in waived_cats.get(s.id, set())
            ]
            if missing and days_to_eta <= 10:
                n = len(missing)
                level = "critical" if days_to_eta <= 3 else "warning"
                add(s, "missing_docs", level,
                    f"{n} required document{'s' if n != 1 else ''} missing "
                    f"(arrives in {max(0, int(days_to_eta))}d)")

        # ── ETA changed recently ──────────────────────────────────────────────
        if s.eta_last_updated and (now - s.eta_last_updated).total_seconds() < 3 * 86400:
            eta_str = f"{s.eta:%-d %b}" if s.eta else "unknown"
            add(s, "eta_changed", "warning", f"ETA updated recently → now {eta_str}")

    # Critical first, then by reference for a stable order
    alerts.sort(key=lambda a: (a["level"] != "critical", a["reference"]))
    return alerts
