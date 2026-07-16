import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import router as v1_router
from app.config import settings
from app.database import engine
from app.models import Base  # imports all models so metadata is populated


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (dev convenience — use Alembic for production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Background loops — each is a no-op if its config is missing
    from app.email_scanner import start_email_scanner_loop
    from app.digest import start_digest_loop
    tasks = [
        asyncio.create_task(start_email_scanner_loop()),
        asyncio.create_task(start_digest_loop()),
    ]

    yield

    for task in tasks:
        task.cancel()
    for task in tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="TAC Logistics API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
