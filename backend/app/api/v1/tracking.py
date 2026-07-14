"""
Unified carrier tracking via Terminal49 (free tier).

Terminal49 covers 60+ carriers through a single API key — no per-carrier keys needed.
Sign up free at https://terminal49.com → Settings → API Key.

Supported carriers include: Maersk, MSC, ZIM, Hapag-Lloyd, CMA CGM, ONE, Evergreen,
COSCO, OOCL, Yang Ming, HMM, PIL, Wan Hai, and more.

Fallback: if Terminal49 is not configured the endpoint returns 503 with instructions.
"""
import os
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel
import httpx

from app.config import settings

router = APIRouter(prefix="/tracking", tags=["tracking"])

T49_BASE = "https://api.terminal49.com/v2"

# ── B/L prefix → human-readable carrier name (used for display before any fetch) ─

BL_PREFIX_MAP: dict[str, str] = {
    "MAEU": "Maersk",    "MSKU": "Maersk",    "MRKU": "Maersk",   "MAEI": "Maersk",
    "ZIMU": "ZIM",       "ZIML": "ZIM",
    "MSCU": "MSC",       "MEDU": "MSC",        "MSMU": "MSC",
    "CMAU": "CMA CGM",   "CGMU": "CMA CGM",    "APLU": "CMA CGM",
    "HLCU": "Hapag-Lloyd","HLBU": "Hapag-Lloyd",
    "HDMU": "HMM",       "HDDU": "HMM",
    "ONEY": "ONE",       "ONEU": "ONE",
    "YMLU": "Yang Ming",
    "COSU": "COSCO",     "CXDU": "COSCO",
    "OOLU": "OOCL",
    "EASU": "Evergreen", "EMCU": "Evergreen",
    "PILR": "PIL",       "PABV": "PIL",
    "WHLC": "Wan Hai",
}

def detect_carrier_name(bl_number: str) -> str:
    return BL_PREFIX_MAP.get(bl_number[:4].upper(), "Unknown Carrier")


# ── Response models ────────────────────────────────────────────────────────────

class TrackingEvent(BaseModel):
    event_type: str
    event_time: str
    location: str | None = None
    description: str | None = None
    is_actual: bool = False


class CarrierTracking(BaseModel):
    carrier: str
    carrier_name: str
    bl_number: str
    vessel_name: str | None = None
    vessel_imo: str | None = None
    eta: str | None = None
    atd: str | None = None
    current_port: str | None = None
    events: list[TrackingEvent] = []


# ── Terminal49 helpers ─────────────────────────────────────────────────────────

def _t49_headers() -> dict:
    return {
        "Authorization": f"Token {settings.TERMINAL49_API_KEY}",
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
    }


def _parse_t49_events(included: list[dict]) -> tuple[list[TrackingEvent], str | None, str | None, str | None]:
    """
    Extract TrackingEvents, ETA, ATD, and current port from Terminal49
    'included' array (JSON:API side-loaded resources).
    """
    events: list[TrackingEvent] = []
    eta: str | None = None
    atd: str | None = None
    current_port: str | None = None

    # Map of known T49 event type → our internal event type
    EVENT_TYPE_MAP = {
        "vessel_departed":  "vessel_departed",
        "vessel_arrived":   "vessel_arrived",
        "transshipment":    "transshipment",
        "loaded":           "loaded_on_vessel",
        "discharged":       "discharged",
        "gate_in":          "gate_in",
        "gate_out":         "gate_out",
        "eta_updated":      "eta_update",
        "delay":            "delay",
        "booking_confirmed":"booking_confirmed",
        "customs_released": "customs_released",
    }

    for item in included:
        if item.get("type") != "event":
            continue
        attrs = item.get("attributes", {})

        raw_type = attrs.get("event_type", "event").lower()
        mapped_type = EVENT_TYPE_MAP.get(raw_type, raw_type)
        event_time = attrs.get("created_at") or attrs.get("timestamp") or ""
        location = attrs.get("location") or attrs.get("port_name")
        is_actual = attrs.get("is_actual", True)

        if "arrival" in raw_type and not is_actual and attrs.get("estimated_time"):
            eta = attrs["estimated_time"]
        if "departure" in raw_type and is_actual and event_time:
            atd = event_time
        if is_actual and location:
            current_port = location

        events.append(TrackingEvent(
            event_type=mapped_type,
            event_time=event_time,
            location=location,
            description=attrs.get("description"),
            is_actual=is_actual,
        ))

    events.sort(key=lambda e: e.event_time)
    return events, eta, atd, current_port


async def _track_via_terminal49(bl_number: str) -> CarrierTracking:
    """
    Register a B/L with Terminal49 (idempotent) and fetch its current tracking state.
    Terminal49 free tier: register up to N shipments and pull tracking data on demand.
    """
    api_key = settings.TERMINAL49_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Carrier tracking is not configured. "
                "Sign up free at terminal49.com, get an API key, "
                "and set TERMINAL49_API_KEY in your .env file. "
                "Terminal49 covers Maersk, MSC, ZIM, Hapag, ONE, Evergreen, COSCO, and 50+ more carriers."
            ),
        )

    carrier_name = detect_carrier_name(bl_number)

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Step 1: Register the tracking (idempotent — T49 returns existing if already tracked)
        reg_resp = await client.post(
            f"{T49_BASE}/trackings",
            headers=_t49_headers(),
            json={
                "data": {
                    "type": "tracking",
                    "attributes": {
                        "bill_of_lading_number": bl_number,
                        "request_type": "bl",
                    },
                }
            },
        )

        if reg_resp.status_code == 422:
            body = reg_resp.json()
            errors = body.get("errors", [])
            detail = errors[0].get("detail", "Invalid B/L number") if errors else "Invalid B/L number"
            raise HTTPException(status_code=422, detail=detail)

        if reg_resp.status_code not in (200, 201):
            # If already tracked, T49 may return 200 with existing data; otherwise bubble error
            raise HTTPException(
                status_code=502,
                detail=f"Terminal49 registration failed (HTTP {reg_resp.status_code}). "
                       "Check your API key or try again later.",
            )

        reg_data = reg_resp.json()
        tracking_id = reg_data.get("data", {}).get("id")
        if not tracking_id:
            raise HTTPException(status_code=502, detail="Terminal49 returned no tracking ID.")

        # Step 2: Fetch full shipment details with events
        detail_resp = await client.get(
            f"{T49_BASE}/trackings/{tracking_id}",
            headers=_t49_headers(),
            params={"include": "events,port_of_lading,port_of_discharge"},
        )

        if detail_resp.status_code == 404:
            raise HTTPException(status_code=404, detail=f"B/L {bl_number!r} not found.")
        if not detail_resp.is_success:
            raise HTTPException(status_code=502, detail="Terminal49 tracking fetch failed.")

        payload = detail_resp.json()

    attrs = payload.get("data", {}).get("attributes", {})
    included = payload.get("included", [])

    # Pull top-level fields from tracking attributes
    vessel_name: str | None = attrs.get("vessel_name")
    vessel_imo: str | None = attrs.get("vessel_imo_number")
    eta: str | None = attrs.get("pod_eta") or attrs.get("estimated_time_of_arrival")
    atd: str | None = attrs.get("atd") or attrs.get("actual_time_of_departure")
    current_port: str | None = attrs.get("location") or attrs.get("current_port")
    shipping_line: str | None = attrs.get("shipping_line_name") or carrier_name

    # Supplement with parsed events
    events, evt_eta, evt_atd, evt_port = _parse_t49_events(included)
    eta = eta or evt_eta
    atd = atd or evt_atd
    current_port = current_port or evt_port

    carrier_slug = bl_number[:4].upper()

    return CarrierTracking(
        carrier=carrier_slug,
        carrier_name=shipping_line,
        bl_number=bl_number,
        vessel_name=vessel_name,
        vessel_imo=vessel_imo,
        eta=eta,
        atd=atd,
        current_port=current_port,
        events=events,
    )


# ── Scraper fallback (playwright, no API key needed) ──────────────────────────

async def _track_via_scraper(bl_number: str) -> CarrierTracking:
    """
    Scrape the carrier's public tracking website directly using a headless browser.
    Used automatically when TERMINAL49_API_KEY is not set.
    Supported carriers: ZIM, Hapag-Lloyd, Maersk (best-effort), MSC (best-effort).
    """
    from app.scrapers.runner import run_scrape

    carrier_name = detect_carrier_name(bl_number)
    result = await run_scrape(bl_number, carrier_name)

    if result.error and not result.success:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Carrier website scraping failed: {result.error}\n\n"
                "Tip: For reliable tracking without API keys, ZIM and Hapag-Lloyd "
                "work best. Maersk and MSC use bot protection that may block scraping.\n\n"
                "Alternatively, sign up free at terminal49.com and set "
                "TERMINAL49_API_KEY in your .env file to cover 60+ carriers."
            ),
        )

    events = [
        TrackingEvent(
            event_type=e.get("event_type", "manual"),
            event_time=e.get("event_time", ""),
            location=e.get("location"),
            description=e.get("description"),
            is_actual=e.get("is_actual", True),
        )
        for e in result.events
    ]

    return CarrierTracking(
        carrier=bl_number[:4].upper(),
        carrier_name=carrier_name,
        bl_number=bl_number,
        vessel_name=result.vessel_name,
        vessel_imo=None,
        eta=result.eta.isoformat() if result.eta else None,
        atd=result.etd.isoformat() if result.etd else None,
        current_port=result.current_port,
        events=events,
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/bl/{bl_number}", response_model=CarrierTracking)
async def get_bl_tracking(
    bl_number: str = Path(..., description="Bill of Lading number (e.g. ZIMU123456789)"),
):
    """
    Fetch live tracking for any B/L.
    - If TERMINAL49_API_KEY is set: uses Terminal49 (60+ carriers, fast).
    - Otherwise: scrapes the carrier's public tracking website directly (no API key needed).
      Best supported: ZIM, Hapag-Lloyd. Maersk/MSC may be blocked by bot protection.
    """
    if settings.TERMINAL49_API_KEY:
        return await _track_via_terminal49(bl_number)
    return await _track_via_scraper(bl_number)


@router.get("/carriers")
async def list_configured_carriers():
    """Returns which tracking backends are currently configured."""
    t49_active = bool(settings.TERMINAL49_API_KEY)
    scraper_covered = ["zim", "hapag"]
    scraper_best_effort = ["maersk", "msc"]
    return {
        "terminal49": t49_active,
        "scraper": not t49_active,
        "covered_carriers": (
            ["maersk", "msc", "zim", "hapag", "cma", "one", "evergreen",
             "cosco", "oocl", "yangming", "hmm", "pil", "wan_hai"]
            if t49_active
            else scraper_covered + scraper_best_effort
        ),
        "scraper_reliable": scraper_covered if not t49_active else [],
        "scraper_best_effort": scraper_best_effort if not t49_active else [],
        "note": (
            "Terminal49 active — 60+ carriers covered via single API key."
            if t49_active
            else (
                "Using direct website scraping (no API key). "
                "ZIM and Hapag-Lloyd are reliable. Maersk/MSC may be blocked by bot protection. "
                "Set TERMINAL49_API_KEY in .env (free at terminal49.com) for full coverage."
            )
        ),
    }
