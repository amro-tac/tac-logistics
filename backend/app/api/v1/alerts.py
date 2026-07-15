import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts import compute_alerts
from app.database import get_db
from app.deps import get_current_tenant_id

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
