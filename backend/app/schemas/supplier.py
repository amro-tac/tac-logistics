from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class SupplierIn(BaseModel):
    name: str
    country: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    commodity: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    country: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    commodity: Optional[str] = None


class SupplierOut(BaseModel):
    id: UUID
    name: str
    country: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    commodity: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
