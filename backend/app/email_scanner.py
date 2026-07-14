"""
IMAP email scanner — runs as a background task every N minutes.

Scans a mailbox for carrier notification emails, extracts container numbers
and new ETA dates, updates matching shipments, and creates a note for each
change so the user can see what changed and why.

No external dependencies — uses Python stdlib imaplib + email only.
"""

import asyncio
import email
import imaplib
import logging
import re
import uuid
from datetime import datetime, timezone
from email.header import decode_header
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.email_log import EmailScanLog, ProcessedEmail
from app.models.note import ShipmentNote
from app.models.shipment import Container, Shipment

logger = logging.getLogger(__name__)

# ── Patterns ─────────────────────────────────────────────────────────────────

# Standard container number: 4 uppercase letters + 7 digits (e.g. ZIMU1234567)
CONTAINER_RE = re.compile(r'\b([A-Z]{3}[UJZ])\s*(\d{7})\b')

# Keywords that signal an ETA follows
ETA_CONTEXT_RE = re.compile(
    r'(?:new\s+eta|revised\s+eta|updated?\s+eta|estimated\s+(?:time\s+of\s+)?arrival|'
    r'arrival\s+date|expected\s+arrival|delayed\s+(?:until|to)|rescheduled\s+(?:to|until)|'
    r'new\s+arrival|arrival\s+on)[:\s]+([^\n\r]{5,60})',
    re.IGNORECASE,
)

# Date formats tried in order — uses a normaliser before matching
DATE_FMTS = [
    ("%d %B %Y",  r'(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})'),
    ("%d %b %Y",  r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})'),
    ("%B %d %Y",  r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})'),
    ("%b %d %Y",  r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})'),
    ("%Y-%m-%d",  r'(\d{4})-(\d{2})-(\d{2})'),
    ("%Y/%m/%d",  r'(\d{4})/(\d{2})/(\d{2})'),
    ("%d/%m/%Y",  r'(\d{2})/(\d{2})/(\d{4})'),
    ("%d-%m-%Y",  r'(\d{2})-(\d{2})-(\d{4})'),
]

# Carrier email domains we trust
CARRIER_DOMAINS = {
    "maersk.com", "zim.com", "msc.com", "hlag.com", "hapag-lloyd.com",
    "one-line.com", "cma-cgm.com", "evergreen-line.com", "cosco.com",
    "yangming.com", "hmm21.com", "pilship.com", "arkas.com", "ictsi.com",
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _decode_mime_words(s: str) -> str:
    parts = decode_header(s)
    out = []
    for raw, enc in parts:
        if isinstance(raw, bytes):
            out.append(raw.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(raw)
    return " ".join(out)


def _extract_text(msg: email.message.Message) -> str:
    """Pull all plain-text parts; fall back to stripped HTML."""
    plain_parts: list[str] = []
    html_parts: list[str] = []

    for part in msg.walk():
        ct = part.get_content_type()
        if ct == "text/plain":
            charset = part.get_content_charset() or "utf-8"
            try:
                plain_parts.append(part.get_payload(decode=True).decode(charset, errors="replace"))
            except Exception:
                pass
        elif ct == "text/html":
            charset = part.get_content_charset() or "utf-8"
            try:
                html_parts.append(part.get_payload(decode=True).decode(charset, errors="replace"))
            except Exception:
                pass

    if plain_parts:
        return "\n".join(plain_parts)

    # Crude HTML strip
    raw = "\n".join(html_parts)
    raw = re.sub(r'<[^>]+>', ' ', raw)
    raw = re.sub(r'&nbsp;', ' ', raw)
    raw = re.sub(r'&amp;', '&', raw)
    raw = re.sub(r'&lt;', '<', raw)
    raw = re.sub(r'&gt;', '>', raw)
    return raw


def _find_containers(text: str) -> list[str]:
    return [f"{m.group(1)}{m.group(2)}" for m in CONTAINER_RE.finditer(text.upper())]


def _parse_date(snippet: str) -> Optional[datetime]:
    """Try to extract a datetime from a short text snippet."""
    # Normalise multiple spaces
    snippet = re.sub(r'\s+', ' ', snippet).strip()

    for fmt, pattern in DATE_FMTS:
        m = re.search(pattern, snippet, re.IGNORECASE)
        if not m:
            continue
        # Reconstruct a clean date string from groups
        groups = [g.strip(",") for g in m.groups()]
        date_str = " ".join(groups)
        # Two-digit year → four-digit
        date_str = re.sub(r'\b(\d{2})\b$', lambda x: str(2000 + int(x.group())) if int(x.group()) < 50 else str(1900 + int(x.group())), date_str)
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue

    return None


def _find_new_eta(text: str) -> Optional[datetime]:
    """Look for ETA-related context windows and extract a date from them."""
    for m in ETA_CONTEXT_RE.finditer(text):
        snippet = m.group(1)
        dt = _parse_date(snippet)
        if dt and dt.year >= 2020:
            return dt
    return None


def _sender_domain(msg: email.message.Message) -> Optional[str]:
    from_hdr = msg.get("From", "")
    m = re.search(r'@([\w.-]+)', from_hdr)
    return m.group(1).lower() if m else None


def _is_carrier_email(msg: email.message.Message) -> bool:
    domain = _sender_domain(msg)
    if not domain:
        return False
    return any(domain == cd or domain.endswith("." + cd) for cd in CARRIER_DOMAINS)


def _message_id(msg: email.message.Message) -> str:
    mid = msg.get("Message-ID", "").strip()
    return mid if mid else msg.get("Date", "") + msg.get("Subject", "")


# ── Sync IMAP work (runs in thread pool) ────────────────────────────────────

def _fetch_carrier_emails(already_seen: set[str]) -> list[tuple[str, str, str]]:
    """
    Returns list of (message_id, sender_domain, body_text) for emails not
    already processed. Raises on connection failure.
    """
    imap = imaplib.IMAP4_SSL(settings.EMAIL_IMAP_SERVER)
    imap.login(settings.EMAIL_ADDRESS, settings.EMAIL_PASSWORD)
    imap.select("INBOX")

    results = []

    # Search for emails in the last 60 days
    since_date = datetime.now(timezone.utc).strftime("%d-%b-%Y")
    # Try carrier domain search; fall back to all recent
    _, data = imap.search(None, f'(SINCE "{since_date}" UNSEEN)')
    if not data or not data[0]:
        _, data = imap.search(None, f'SINCE "{since_date}"')

    uids = data[0].split() if data[0] else []

    for uid in uids[-200:]:  # cap at 200 to avoid overwhelming
        _, msg_data = imap.fetch(uid, "(RFC822)")
        if not msg_data or not msg_data[0]:
            continue
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        mid = _message_id(msg)
        if mid in already_seen:
            continue
        if not _is_carrier_email(msg):
            continue

        body = _extract_text(msg)
        domain = _sender_domain(msg) or "unknown"
        results.append((mid, domain, body))

    imap.logout()
    return results


# ── Async orchestration ──────────────────────────────────────────────────────

async def _run_scan_async() -> tuple[int, int]:
    """Returns (emails_checked, updates_made)."""
    loop = asyncio.get_event_loop()

    async with AsyncSessionLocal() as db:
        # Load already-processed message IDs
        result = await db.execute(select(ProcessedEmail.message_id))
        already_seen: set[str] = set(result.scalars().all())

    # IMAP is blocking — run in thread pool
    try:
        carrier_emails = await loop.run_in_executor(
            None, _fetch_carrier_emails, already_seen
        )
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(f"IMAP auth/connection error: {exc}") from exc

    updates_made = 0

    async with AsyncSessionLocal() as db:
        for mid, sender_domain, body in carrier_emails:
            containers = _find_containers(body)
            new_eta = _find_new_eta(body)

            if not containers or not new_eta:
                # Still mark as processed so we skip it next time
                db.add(ProcessedEmail(message_id=mid))
                continue

            for cnum in set(containers):
                result = await db.execute(
                    select(Container, Shipment)
                    .join(Shipment, Container.shipment_id == Shipment.id)
                    .where(Container.container_number == cnum)
                )
                row = result.first()
                if not row:
                    continue

                container, shipment = row
                old_eta = shipment.eta

                # Only update if the new date is meaningfully different (> 12 hours)
                if old_eta:
                    delta = abs((new_eta - old_eta).total_seconds())
                    if delta < 43200:
                        continue

                old_str = old_eta.strftime("%-d %b %Y") if old_eta else "unknown"
                new_str = new_eta.strftime("%-d %b %Y")
                shipment.eta = new_eta
                shipment.eta_last_updated = datetime.now(timezone.utc).replace(tzinfo=None)

                note_text = (
                    f"[Auto] ETA updated via carrier email ({sender_domain}): "
                    f"{old_str} → {new_str} | Container {cnum}"
                )
                db.add(ShipmentNote(
                    shipment_id=shipment.id,
                    tenant_id=shipment.tenant_id,
                    text=note_text,
                ))
                updates_made += 1
                logger.info("Updated ETA for %s via email: %s → %s", cnum, old_str, new_str)

            db.add(ProcessedEmail(message_id=mid))

        await db.commit()

    return len(carrier_emails), updates_made


async def run_scan() -> tuple[int, int, Optional[str]]:
    """
    Public entry point. Returns (emails_checked, updates_made, error_str|None).
    Always writes a row to email_scan_log.
    """
    emails_checked, updates_made, error_str = 0, 0, None
    try:
        emails_checked, updates_made = await _run_scan_async()
    except Exception as exc:
        error_str = str(exc)
        logger.error("Email scan failed: %s", exc)

    async with AsyncSessionLocal() as db:
        db.add(EmailScanLog(
            emails_checked=emails_checked,
            updates_made=updates_made,
            error=error_str,
        ))
        await db.commit()

    return emails_checked, updates_made, error_str


# ── Background loop ──────────────────────────────────────────────────────────

async def start_email_scanner_loop():
    """Runs forever, scanning every EMAIL_SCAN_INTERVAL_MINUTES minutes."""
    if not settings.EMAIL_ADDRESS or not settings.EMAIL_IMAP_SERVER:
        logger.info("Email scanner disabled — set EMAIL_ADDRESS and EMAIL_IMAP_SERVER in .env")
        return

    logger.info(
        "Email scanner started — checking %s every %d min",
        settings.EMAIL_ADDRESS,
        settings.EMAIL_SCAN_INTERVAL_MINUTES,
    )

    while True:
        checked, updated, err = await run_scan()
        if err:
            logger.warning("Scan error: %s", err)
        else:
            logger.info("Scan complete — %d emails checked, %d ETA updates", checked, updated)
        await asyncio.sleep(settings.EMAIL_SCAN_INTERVAL_MINUTES * 60)
