"""
Run once to seed the initial tenant, admin user, and carrier records.
  alembic upgrade head   ← run this first
  python seed.py
"""
import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.carrier import Carrier
from app.core.security import hash_password

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_async_engine(settings.DATABASE_URL, connect_args=connect_args)
Session = async_sessionmaker(engine, expire_on_commit=False)

CARRIERS = [
    {"name": "ZIM",         "scac": "ZIMU", "default_free_days": 5},
    {"name": "Maersk",      "scac": "MAEU", "default_free_days": 5},
    {"name": "MSC",         "scac": "MSCU", "default_free_days": 5},
    {"name": "Hapag-Lloyd", "scac": "HLCU", "default_free_days": 7},
    {"name": "ONE",         "scac": "ONEY", "default_free_days": 5},
    {"name": "CMA CGM",     "scac": "CMAU", "default_free_days": 5},
    {"name": "Evergreen",   "scac": "EASU", "default_free_days": 5},
]


async def main():
    async with Session() as db:
        # Tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == "tac-logistics"))
        tenant = result.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(id=uuid.uuid4(), name="TAC Logistics", slug="tac-logistics")
            db.add(tenant)
            await db.flush()
            print(f"Created tenant: {tenant.name} ({tenant.id})")

        # Admin user
        result = await db.execute(select(User).where(User.email == "admin@tac.com"))
        if not result.scalar_one_or_none():
            admin = User(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                email="admin@tac.com",
                hashed_password=hash_password("admin123"),
                full_name="TAC Admin",
                role=UserRole.ADMIN,
            )
            db.add(admin)
            print("Created user: admin@tac.com / admin123")

        # Carriers
        for c in CARRIERS:
            result = await db.execute(select(Carrier).where(Carrier.scac == c["scac"]))
            if not result.scalar_one_or_none():
                db.add(Carrier(id=uuid.uuid4(), **c))
                print(f"Created carrier: {c['name']}")

        await db.commit()
        print("\nDone. Start the server:  uvicorn app.main:app --reload")


asyncio.run(main())
