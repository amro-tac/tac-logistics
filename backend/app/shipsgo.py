"""ShipsGo v2 integration — the channel that feeds B/L voyage data back into
the app. Async ShipsGo v2 integration.

Terminal49's free tier is write-only; ShipsGo charges ~1 credit per B/L and
then reads are free.

* POST /v2/ocean/shipments once per B/L (spends a credit; 409 = already
  tracked → success). Done on booking when configured.
* Data comes back via a 30-minute background poller (`poll_forever`), which is
  the reliable channel. (A webhook receiver exists in the fork but its
  signature scheme is unverified, so the poller is what we rely on.)
* `apply_shipment()` merges a ShipsGo payload onto our shipment: voyage fields,
  containers, ETA-change events, the current leg, the real GeoJSON route, and a
  forward-only stage auto-advance (SAILING → in_transit, ARRIVED/DISCHARGED →
  at_port).

Auth: X-Shipsgo-User-Token header (SHIPSGO_AUTH_CODE). Idles cleanly when unset.
Docs: https://api.shipsgo.com/docs/v2/
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import AsyncSessionLocal
from app.core.state_machine import can_transition, compute_risk_flag, transition
from app.models.carrier import Carrier
from app.models.shipment import Container, ContainerType, Shipment, ShipmentStatus
from app.models.tracking import TrackingEvent, TrackingEventType, TrackingSource

log = logging.getLogger(__name__)

BASE = "https://api.shipsgo.com/v2"
POLL_INTERVAL_S = 30 * 60
FIRST_POLL_DELAY_S = 300

STATUS_TARGET: dict[str, ShipmentStatus] = {
    "BOOKED": ShipmentStatus.BOOKED,
    "LOADED": ShipmentStatus.BOOKED,
    "SAILING": ShipmentStatus.IN_TRANSIT,
    "ARRIVED": ShipmentStatus.AT_PORT,
    "DISCHARGED": ShipmentStatus.AT_PORT,
}


def token() -> str:
    return settings.SHIPSGO_AUTH_CODE


def is_configured() -> bool:
    return bool(token())


def _headers() -> dict:
    return {"X-Shipsgo-User-Token": token(), "Accept": "application/json"}


class ShipsGoError(Exception):
    pass


def _error_from(resp: httpx.Response) -> ShipsGoError:
    if resp.status_code == 402:
        return ShipsGoError("ShipsGo: out of credits — buy a credit pack in the dashboard")
    try:
        detail = resp.json().get("message", resp.text)
    except Exception:
        detail = resp.text
    return ShipsGoError(f"HTTP {resp.status_code}: {str(detail)[:200]}")


async def register_bl(bl_number: str, scac: str | None = None, reference: str | None = None) -> bool:
    """Start tracking a Master B/L (spends one credit). 409 = already tracked."""
    body: dict = {"booking_number": bl_number, "carrier": scac}
    if reference:
        body["reference"] = reference[:128]
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(f"{BASE}/ocean/shipments", json=body, headers=_headers())
    if resp.is_success or resp.status_code == 409:
        return True
    raise _error_from(resp)


async def register_container(container_number: str, reference: str | None = None) -> bool:
    body: dict = {"container_number": container_number, "carrier": None}
    if reference:
        body["reference"] = reference[:128]
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(f"{BASE}/ocean/shipments", json=body, headers=_headers())
    if resp.is_success or resp.status_code == 409:
        return True
    raise _error_from(resp)


async def _fetch_by_filter(field: str, value: str) -> dict | None:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            f"{BASE}/ocean/shipments",
            params={f"filters[{field}]": f"eq:{value}", "take": 1},
            headers=_headers(),
        )
        if not resp.is_success:
            raise ShipsGoError(f"list failed: HTTP {resp.status_code} {resp.text[:200]}")
        shipments = resp.json().get("shipments") or []
        if not shipments:
            return None
        summary = shipments[0]
        detail = await client.get(f"{BASE}/ocean/shipments/{summary['id']}", headers=_headers())
    if detail.is_success:
        return detail.json().get("shipment") or summary
    return summary


async def fetch_by_bl(bl_number: str) -> dict | None:
    return await _fetch_by_filter("booking_number", bl_number)


async def fetch_by_container(container_number: str) -> dict | None:
    return await _fetch_by_filter("container_number", container_number)


async def fetch_geojson(shipsgo_id: int) -> dict | None:
    """ShipsGo's own real route — free to re-fetch once tracked. None if no
    route data yet (just registered, nothing sailed)."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(f"{BASE}/ocean/shipments/{shipsgo_id}/geojson", headers=_headers())
    if resp.status_code == 404:
        return None
    if not resp.is_success:
        raise ShipsGoError(f"geojson failed: HTTP {resp.status_code} {resp.text[:200]}")
    return resp.json().get("geojson")


# ── Payload → our shipment ────────────────────────────────────────────────────

def _parse_dt(v) -> datetime | None:
    if not v or not isinstance(v, str):
        return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError:
        return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _container_type(size, type_text) -> ContainerType | None:
    text = str(type_text or "").upper().replace("-", " ").replace("_", " ")
    if "REEFER" in text or text == "RF":
        return ContainerType.REEFER
    if size == 20:
        return ContainerType.TWENTY_GP
    if size in (40, 45):
        if "HIGH" in text or "HC" in text or "HQ" in text:
            return ContainerType.FORTY_HQ
        return ContainerType.FORTY_GP
    return None


def _primary_movements(sg: dict) -> list[dict]:
    for cont in sg.get("containers") or []:
        movements = cont.get("movements") or []
        if movements:
            return movements
    return []


def _last_act_index(movements: list[dict]) -> int | None:
    idx = None
    for i, mv in enumerate(movements):
        if str(mv.get("status") or "").upper() == "ACT":
            idx = i
    return idx


def _current_vessel(sg: dict) -> tuple[str | None, str | None]:
    """(vessel, voyage) carrying the cargo now — walk back from the last
    completed (ACT) port call, NOT the latest-timestamped (often future) leg."""
    movements = _primary_movements(sg)
    last_act_idx = _last_act_index(movements)
    if last_act_idx is None:
        return None, None
    for mv in reversed(movements[: last_act_idx + 1]):
        vessel = mv.get("vessel")
        if vessel:
            name = vessel.get("name") if isinstance(vessel, dict) else str(vessel)
            return name, mv.get("voyage")
    return None, None


def _current_leg(sg: dict) -> tuple[str | None, str | None, str | None, str | None]:
    """(from_port, from_at, to_port, to_at) — last completed call → next
    estimated one, so transshipment voyages plot in the right place."""
    movements = _primary_movements(sg)
    last_act_idx = _last_act_index(movements)
    if last_act_idx is None:
        return None, None, None, None
    from_mv = movements[last_act_idx]
    from_port = (from_mv.get("location") or {}).get("name")
    from_at = from_mv.get("timestamp")
    to_port = to_at = None
    for mv in movements[last_act_idx + 1:]:
        if str(mv.get("status") or "").upper() == "EST":
            to_port = (mv.get("location") or {}).get("name")
            to_at = mv.get("timestamp")
            break
    return from_port, from_at, to_port, to_at


async def apply_shipment(session, shipment: Shipment, sg: dict) -> bool:
    """Merge a ShipsGo OceanShipment payload into ours. Returns True if changed.
    Carrier data overwrites voyage fields; user-owned fields are untouched."""
    changed = False

    def set_if(attr: str, value) -> None:
        nonlocal changed
        if value is not None and getattr(shipment, attr) != value:
            setattr(shipment, attr, value)
            changed = True

    route = sg.get("route") or {}
    pol = route.get("port_of_loading") or {}
    pod = route.get("port_of_discharge") or {}
    set_if("port_of_loading", (pol.get("location") or {}).get("name"))
    set_if("port_of_discharge", (pod.get("location") or {}).get("name"))

    vessel, voyage = _current_vessel(sg)
    set_if("vessel_name", vessel)
    set_if("voyage_number", voyage)

    leg_from, leg_from_at, leg_to, leg_to_at = _current_leg(sg)
    set_if("current_leg_from", leg_from)
    set_if("current_leg_from_at", _parse_dt(leg_from_at))
    set_if("current_leg_to", leg_to)
    set_if("current_leg_to_at", _parse_dt(leg_to_at))

    shipsgo_id = sg.get("id")
    if shipsgo_id is not None:
        set_if("shipsgo_shipment_id", int(shipsgo_id))
        try:
            geojson = await fetch_geojson(int(shipsgo_id))
        except ShipsGoError as exc:
            log.info("ShipsGo geojson fetch skipped for %s: %s", shipsgo_id, exc)
        else:
            if geojson is not None:
                set_if("route_geojson", json.dumps(geojson))

    carrier = sg.get("carrier") or {}
    if shipment.carrier_id is None and carrier.get("scac"):
        row = (await session.execute(
            select(Carrier).where(Carrier.scac == carrier["scac"])
        )).scalar_one_or_none()
        if row:
            shipment.carrier_id = row.id
            changed = True

    status = str(sg.get("status") or "").upper()
    etd = _parse_dt(pol.get("date_of_loading"))
    eta = _parse_dt(pod.get("date_of_discharge"))
    if etd:
        set_if("etd", etd)
        if status in ("SAILING", "ARRIVED", "DISCHARGED"):
            set_if("atd", etd)
    if eta:
        old_eta = shipment.eta
        set_if("eta", eta)
        if status == "DISCHARGED":
            set_if("ata", eta)
        if old_eta and eta != old_eta:
            shipment.eta_last_updated = _utcnow()
            session.add(TrackingEvent(
                shipment_id=shipment.id,
                event_type=TrackingEventType.ETA_UPDATE,
                event_time=_utcnow(),
                description=f"ETA {old_eta:%d %b} → {eta:%d %b} (ShipsGo)",
                eta_at_time=eta,
                source=TrackingSource.MANUAL,
            ))

    existing = {
        (c.container_number or "").upper()
        for c in (await session.execute(
            select(Container).where(Container.shipment_id == shipment.id)
        )).scalars()
    }
    cont_rows = sg.get("containers") or []
    if not cont_rows and sg.get("container_number"):
        cont_rows = [{"number": sg["container_number"]}]
    for cont in cont_rows:
        number = str(cont.get("number") or "").upper()
        if not number or number in existing:
            continue
        session.add(Container(
            shipment_id=shipment.id,
            container_number=number,
            container_type=_container_type(cont.get("size"), cont.get("type")),
        ))
        existing.add(number)
        changed = True

    if not shipment.tracking_active and status not in ("", "NEW"):
        shipment.tracking_active = True
        changed = True

    target = STATUS_TARGET.get(status)
    if target is not None:
        before = shipment.status
        await _advance_towards(session, shipment, target)
        if shipment.status != before:
            changed = True

    if changed:
        shipment.risk_flag = compute_risk_flag(shipment)
        session.add(shipment)
    return changed


async def _advance_towards(session, shipment: Shipment, target: ShipmentStatus) -> None:
    order = [
        ShipmentStatus.DRAFT, ShipmentStatus.BOOKED,
        ShipmentStatus.IN_TRANSIT, ShipmentStatus.AT_PORT,
    ]
    if shipment.status not in order or target not in order:
        return
    now = _utcnow()
    while order.index(shipment.status) < order.index(target):
        nxt = order[order.index(shipment.status) + 1]
        if nxt == ShipmentStatus.IN_TRANSIT and not shipment.atd:
            shipment.atd = shipment.etd or now
        if nxt == ShipmentStatus.AT_PORT and not shipment.ata:
            shipment.ata = shipment.eta or now
        if not can_transition(shipment, nxt):
            log.info("ShipsGo auto-advance stopped at %s for %s", shipment.status, shipment.reference)
            return
        await transition(shipment, nxt, session)


# ── Background polling loop ───────────────────────────────────────────────────

async def sync_all() -> int:
    """Poll ShipsGo for every in-flight shipment. Returns #updated."""
    if not is_configured():
        return 0
    updated = 0
    active = [
        ShipmentStatus.DRAFT, ShipmentStatus.BOOKED,
        ShipmentStatus.IN_TRANSIT, ShipmentStatus.AT_PORT,
    ]
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(Shipment).where(
                Shipment.bl_number.isnot(None),
                Shipment.status.in_(active),
            )
        )).scalars().all()
        for shipment in rows:
            try:
                sg = await fetch_by_bl(shipment.bl_number)
            except ShipsGoError as exc:
                log.info("ShipsGo poll skipped for %s: %s", shipment.bl_number, exc)
                continue
            if not sg:
                continue
            try:
                if await apply_shipment(session, shipment, sg):
                    updated += 1
                await session.commit()
            except Exception:
                await session.rollback()
                log.exception("ShipsGo apply failed for %s", shipment.bl_number)

        container_rows = (await session.execute(
            select(Shipment)
            .where(Shipment.bl_number.is_(None), Shipment.status.in_(active))
            .options(selectinload(Shipment.containers))
        )).scalars().all()
        for shipment in container_rows:
            if not shipment.containers:
                continue
            primary = shipment.containers[0].container_number
            if not primary:
                continue
            try:
                sg = await fetch_by_container(primary)
            except ShipsGoError as exc:
                log.info("ShipsGo poll skipped for container %s: %s", primary, exc)
                continue
            if not sg:
                continue
            try:
                if await apply_shipment(session, shipment, sg):
                    updated += 1
                await session.commit()
            except Exception:
                await session.rollback()
                log.exception("ShipsGo apply failed for container %s", primary)
    if updated:
        log.info("ShipsGo poll: %d shipment(s) updated", updated)
    return updated


async def poll_forever() -> None:
    """Lifespan task — idles cheaply until SHIPSGO_AUTH_CODE is configured."""
    if not is_configured():
        log.info("ShipsGo tracking disabled — set SHIPSGO_AUTH_CODE in .env to enable")
    await asyncio.sleep(FIRST_POLL_DELAY_S)
    while True:
        try:
            if is_configured():
                await sync_all()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("ShipsGo poll loop error")
        await asyncio.sleep(POLL_INTERVAL_S)
