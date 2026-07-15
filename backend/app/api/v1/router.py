from fastapi import APIRouter
from app.api.v1.alerts import router as alerts_router
from app.api.v1.auth import router as auth_router
from app.api.v1.carriers import router as carriers_router
from app.api.v1.checklist_state import router as checklist_router
from app.api.v1.documents import router as documents_router
from app.api.v1.email_scanner import router as email_scanner_router
from app.api.v1.finance import router as finance_router
from app.api.v1.notes import router as notes_router
from app.api.v1.shipments import router as shipments_router
from app.api.v1.suppliers import router as suppliers_router
from app.api.v1.tracking import router as tracking_router
from app.api.v1.vessels import router as vessels_router
from app.api.v1.webhooks import router as webhooks_router

router = APIRouter()
router.include_router(alerts_router)
router.include_router(auth_router)
router.include_router(carriers_router)
router.include_router(checklist_router)
router.include_router(documents_router)
router.include_router(email_scanner_router)
router.include_router(finance_router)
router.include_router(notes_router)
router.include_router(shipments_router)
router.include_router(suppliers_router)
router.include_router(tracking_router)
router.include_router(vessels_router)
router.include_router(webhooks_router)
