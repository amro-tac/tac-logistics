from sqlalchemy import Column, String
from app.models.base import TenantScoped


class Supplier(TenantScoped):
    __tablename__ = "suppliers"

    name = Column(String, nullable=False)
    country = Column(String)
    contact = Column(String)
    email = Column(String)
    phone = Column(String)
    commodity = Column(String)
