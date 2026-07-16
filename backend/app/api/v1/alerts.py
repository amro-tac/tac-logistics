import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts import compute_alerts
from app.config import settings
from app.database import get_db
from app.deps import get_current_tenant_id, get_current_user
from app.models.user import User

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
):
    """All current alerts across the tenant's active shipments, critical first."""
    alerts = await compute_alerts(tenant_id, db)
    return {
        "critical": sum(1 for a in alerts if a["level"] == "critical"),
        "warning": sum(1 for a in alerts if a["level"] == "warning"),
        "alerts": alerts,
    }


# ── Daily email digest ─────────────────────────────────────────────────────────

@router.get("/digest/status")
async def digest_status(user: User = Depends(get_current_user)):
    from app.digest import is_configured
    return {
        "configured": is_configured(),
        "digest_hour": settings.DIGEST_HOUR,
        "recipient": user.notification_email,
    }


@router.post("/digest/send-now")
async def send_digest_now(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send the current alerts digest to the requesting user (test/manual send)."""
    from app.digest import is_configured, build_digest, send_email

    if not is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Digest not configured — set SMTP_HOST (Gmail: smtp.gmail.com) in the backend .env",
        )
    if not user.notification_email:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Set your notification email first (on any shipment's Alerts panel, or Settings)",
        )

    alerts = await compute_alerts(user.tenant_id, db)
    subject, body = build_digest(alerts)  # manual send goes out even when all clear
    try:
        await send_email(user.notification_email, subject, body)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Send failed: {exc}")

    return {"sent": True, "to": user.notification_email, "alerts": len(alerts)}
