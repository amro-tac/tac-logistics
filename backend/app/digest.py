"""
Daily alert digest — emails each user their tenant's active alerts.

Runs as a background task once a day at DIGEST_HOUR (server local time),
reusing the same alert computation as GET /alerts. Enabled by setting
SMTP_HOST in .env; Gmail users can reuse the email-scanner credentials
(SMTP_HOST=smtp.gmail.com + the same app password).
"""

import asyncio
import logging
import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import select

from app.alerts import compute_alerts
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(settings.SMTP_HOST and _username() and _password())


def _username() -> str:
    return settings.SMTP_USERNAME or settings.EMAIL_ADDRESS


def _password() -> str:
    return settings.SMTP_PASSWORD or settings.EMAIL_PASSWORD


def build_digest(alerts: list[dict]) -> tuple[str, str]:
    """Returns (subject, plain-text body)."""
    critical = [a for a in alerts if a["level"] == "critical"]
    warning = [a for a in alerts if a["level"] == "warning"]

    if not alerts:
        subject = "TAC Logistics — all clear, no active alerts"
        body = "No active alerts across your shipments right now.\n"
        return subject, body

    parts = []
    if critical:
        parts.append(f"{len(critical)} critical")
    if warning:
        parts.append(f"{len(warning)} warning{'s' if len(warning) != 1 else ''}")
    subject = f"TAC Logistics — {', '.join(parts)}"

    lines = [f"Active alerts as of {datetime.now():%-d %b %Y, %H:%M}", ""]
    if critical:
        lines.append("CRITICAL")
        lines += [f"  • {a['reference']}: {a['message']}" for a in critical]
        lines.append("")
    if warning:
        lines.append("Warnings")
        lines += [f"  • {a['reference']}: {a['message']}" for a in warning]
        lines.append("")
    lines.append("Open TAC Logistics for details.")
    return subject, "\n".join(lines)


def _send_sync(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = _username()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
        smtp.ehlo()
        if settings.SMTP_STARTTLS:
            smtp.starttls()
            smtp.ehlo()
        # Some relays (e.g. a local postfix) don't do auth — only log in when offered
        if _password() and smtp.has_extn("auth"):
            smtp.login(_username(), _password())
        smtp.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    if not is_configured():
        raise RuntimeError("Digest not configured — set SMTP_HOST (and credentials) in .env")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_sync, to, subject, body)


async def run_daily_digest() -> tuple[int, int]:
    """Send each tenant's digest to its users. Returns (emails_sent, errors).

    Tenants with no active alerts are skipped — the daily run alerts on
    problems; it doesn't send 'all clear' noise.
    """
    sent = errors = 0
    async with AsyncSessionLocal() as db:
        users = (await db.execute(
            select(User).where(User.notification_email.isnot(None))
        )).scalars().all()

        alerts_by_tenant: dict = {}
        for user in users:
            if user.tenant_id not in alerts_by_tenant:
                alerts_by_tenant[user.tenant_id] = await compute_alerts(user.tenant_id, db)
            alerts = alerts_by_tenant[user.tenant_id]
            if not alerts:
                continue
            subject, body = build_digest(alerts)
            try:
                await send_email(user.notification_email, subject, body)
                sent += 1
            except Exception:
                errors += 1
                logger.exception("Digest send failed for %s", user.notification_email)

    logger.info("Alert digest run complete — %d sent, %d errors", sent, errors)
    return sent, errors


async def start_digest_loop():
    """Runs forever, sending the digest once a day at DIGEST_HOUR."""
    if not is_configured():
        logger.info("Alert digest disabled — set SMTP_HOST in .env to enable")
        return

    logger.info("Alert digest enabled — sending daily at %02d:00", settings.DIGEST_HOUR)
    while True:
        now = datetime.now()
        next_run = now.replace(hour=settings.DIGEST_HOUR, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            await run_daily_digest()
        except Exception:
            logger.exception("Alert digest run failed")
