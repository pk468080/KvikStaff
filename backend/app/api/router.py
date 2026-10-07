from fastapi import APIRouter

from app.api.v1.account import router as account_router
from app.api.v1.addresses import router as addresses_router
from app.api.v1.auth import router as auth_router
from app.api.v1.availability import router as availability_router
from app.api.v1.bookings import router as bookings_router
from app.api.v1.chat import router as chat_router
from app.api.v1.health import router as health_router
from app.api.v1.home import router as home_router
from app.api.v1.invoices import router as invoices_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.payments import router as payments_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.services import router as services_router
from app.api.v1.support import router as support_router
from app.api.v1.worker_presence import (
    router as worker_presence_router,
)

api_router = APIRouter()


api_router.include_router(
    health_router,
    tags=["health"],
)

api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["auth"],
)

api_router.include_router(
    availability_router,
    prefix="/availability",
    tags=["availability"],
)

api_router.include_router(
    services_router,
    prefix="/services",
    tags=["services"],
)

api_router.include_router(
    addresses_router,
    prefix="/addresses",
    tags=["addresses"],
)

api_router.include_router(
    bookings_router,
    prefix="/bookings",
    tags=["bookings"],
)

api_router.include_router(
    reviews_router,
    prefix="/reviews",
    tags=["reviews"],
)

api_router.include_router(
    notifications_router,
    prefix="/notifications",
    tags=["notifications"],
)

api_router.include_router(
    invoices_router,
    prefix="/invoices",
    tags=["invoices"],
)

api_router.include_router(
    chat_router,
    prefix="/chat",
    tags=["chat"],
)

api_router.include_router(
    support_router,
    prefix="/support",
    tags=["support"],
)

api_router.include_router(
    account_router,
    prefix="/account",
    tags=["account"],
)

api_router.include_router(
    home_router,
    prefix="/home",
    tags=["home"],
)

api_router.include_router(
    payments_router,
    prefix="/payments",
    tags=["payments"],
)
api_router.include_router(
    worker_presence_router,
    prefix="/worker/presence",
    tags=["worker-presence"],
)