from fastapi import APIRouter

from app.api.v1.addresses import (
    router as addresses_router,
)
from app.api.v1.auth import (
    router as auth_router,
)
from app.api.v1.availability import (
    router as availability_router,
)
from app.api.v1.bookings import (
    router as bookings_router,
)
from app.api.v1.health import (
    router as health_router,
)
from app.api.v1.services import (
    router as services_router,
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