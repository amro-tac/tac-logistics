from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models.email_log import EmailScanLog
from app.models.user import User

router = APIRouter(prefix="/email-scanner", tags=["email-scanner"])


@router.get("/status")
async def get_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    configured = bool(settings.EMAIL_ADDRESS and settings.EMAIL_IMAP_SERVER)

    result = await db.execute(
        select(EmailScanLog).order_by(desc(EmailScanLog.scanned_at)).limit(10)
    )
    logs = result.scalars().all()

    last_log = logs[0] if logs else None

    return {
        "configured": configured,
        "email_address": settings.EMAIL_ADDRESS if configured else None,
        "imap_server": settings.EMAIL_IMAP_SERVER if configured else None,
        "interval_minutes": settings.EMAIL_SCAN_INTERVAL_MINUTES,
        "last_scan": last_log.scanned_at.isoformat() if last_log else None,
        "last_emails_checked": last_log.emails_checked if last_log else 0,
        "last_updates_made": last_log.updates_made if last_log else 0,
        "last_error": last_log.error if last_log else None,
        "recent_logs": [
            {
                "scanned_at": log.scanned_at.isoformat(),
                "emails_checked": log.emails_checked,
                "updates_made": log.updates_made,
                "error": log.error,
            }
            for log in logs
        ],
    }


@router.post("/scan-now")
async def trigger_scan(_: User = Depends(get_current_user)):
    """Trigger an immediate scan (runs in background, returns quickly)."""
    if not settings.EMAIL_ADDRESS or not settings.EMAIL_IMAP_SERVER:
        return {"queued": False, "reason": "Email scanner not configured"}

    import asyncio
    from app.email_scanner import run_scan
    asyncio.create_task(run_scan())
    return {"queued": True}
