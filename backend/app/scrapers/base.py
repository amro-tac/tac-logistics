"""
Shared types and text-extraction helpers for all carrier scrapers.
"""
import re
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

log = logging.getLogger(__name__)

# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ScrapeResult:
    carrier: str = ""
    bl_number: str = ""
    vessel_name: Optional[str] = None
    voyage_number: Optional[str] = None
    port_of_loading: Optional[str] = None
    port_of_discharge: Optional[str] = None
    etd: Optional[datetime] = None
    eta: Optional[datetime] = None
    current_port: Optional[str] = None
    raw_status: Optional[str] = None      # carrier's own status text
    mapped_status: Optional[str] = None   # our internal status key
    events: list[dict] = field(default_factory=list)
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        return self.error is None and (
            self.eta is not None
            or self.vessel_name is not None
            or self.raw_status is not None
        )


# ── Date parsing ──────────────────────────────────────────────────────────────

_DATE_FMTS = [
    "%d %b %Y", "%d %B %Y",
    "%b %d, %Y", "%B %d, %Y",
    "%b %d %Y",  "%B %d %Y",
    "%Y-%m-%d",
    "%d/%m/%Y",  "%m/%d/%Y",
    "%d-%m-%Y",  "%m-%d-%Y",
    "%d.%m.%Y",
]

def parse_date(text: str) -> Optional[datetime]:
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(text.strip(), fmt)
        except ValueError:
            continue
    return None


# ── Extract all dates from free text ─────────────────────────────────────────

_DATE_RE = re.compile(
    r'\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b'
    r'|\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b'
    r'|\b(\d{4}-\d{2}-\d{2})\b'
    r'|\b(\d{1,2}[/]\d{1,2}[/]\d{4})\b',
    re.IGNORECASE,
)

def extract_dates(text: str) -> list[datetime]:
    dates = []
    for m in _DATE_RE.finditer(text):
        raw = next(g for g in m.groups() if g)
        d = parse_date(raw)
        if d:
            dates.append(d)
    return dates


# ── Extract ETA: look for keyword context then pick the nearest future date ───

_ETA_CONTEXT_RE = re.compile(
    r'(?:eta|e\.t\.a|estimated\s+(?:time\s+of\s+)?arrival|expected\s+arrival'
    r'|arrival\s+date|estimated\s+delivery).{0,60}?'
    r'(\d{1,2}\s+\w{3}[a-z]*\.?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})',
    re.IGNORECASE | re.DOTALL,
)

def extract_eta(text: str) -> Optional[datetime]:
    m = _ETA_CONTEXT_RE.search(text)
    if m:
        d = parse_date(m.group(1))
        if d:
            return d

    # Fallback: pick earliest future date in the whole page text
    dates = [d for d in extract_dates(text) if d > datetime(2024, 1, 1)]
    future = [d for d in dates if d > datetime.utcnow()]
    if future:
        return min(future)
    return None


# ── Extract vessel name ───────────────────────────────────────────────────────

_VESSEL_RE = re.compile(
    r'\b((?:ZIM|MAERSK|MSC|HAPAG|CMA|COSCO|EVERGREEN|ONE|HMM|PIL|OOCL|CSCL|YML|WANHAI)\s+'
    r'[A-Z][A-Z0-9 \-]{2,28})\b',
    re.IGNORECASE,
)

def extract_vessel_name(text: str) -> Optional[str]:
    m = _VESSEL_RE.search(text)
    return m.group(1).strip().upper() if m else None


# ── Map page text to internal status ─────────────────────────────────────────

_STATUS_MAP = [
    (["customs hold", "held by customs", "customs inspection"], "customs"),
    (["customs cleared", "customs released"],                   "released"),
    (["at destination", "arrived at destination",
      "discharged", "unloaded", "at port", "arrived"],          "at_port"),
    (["on board", "loaded on vessel", "in transit", "at sea",
      "vessel departed", "departed", "sailing", "en route"],    "in_transit"),
    (["booking confirmed", "booking received", "booked"],       "booked"),
    (["released", "available", "out for delivery", "delivered"],"released"),
]

def extract_status(text: str) -> Optional[str]:
    t = text.lower()
    for keywords, status in _STATUS_MAP:
        if any(kw in t for kw in keywords):
            return status
    return None


# ── Shared browser launch args ────────────────────────────────────────────────

BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-extensions",
]

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)
