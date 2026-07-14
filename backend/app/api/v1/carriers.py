from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.database import get_db
from app.deps import get_current_user
from app.models.carrier import Carrier
from app.models.user import User

router = APIRouter(prefix="/carriers", tags=["carriers"])


class CarrierOut(BaseModel):
    id: UUID
    name: str
    scac: str | None
    default_free_days: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CarrierOut])
async def list_carriers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Carrier).order_by(Carrier.name))
    return result.scalars().all()
