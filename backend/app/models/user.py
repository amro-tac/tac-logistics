import enum
from sqlalchemy import Column, String, Enum, Boolean
from app.models.base import TenantScoped


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    LOGISTICS = "logistics"
    COMPLIANCE = "compliance"
    MANAGEMENT = "management"
    WAREHOUSE = "warehouse"


class User(TenantScoped):
    __tablename__ = "users"

    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.LOGISTICS)
    is_active = Column(Boolean, default=True, nullable=False)
    notification_phone = Column(String)
    notification_email = Column(String)
