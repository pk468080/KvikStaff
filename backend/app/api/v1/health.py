from fastapi import APIRouter, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import engine

router = APIRouter()


@router.get("/health/live")
async def liveness() -> dict:
    return {"success": True, "data": {"status": "ok"}, "error": None}


@router.get("/health/ready")
async def readiness(response: Response) -> dict:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "success": False,
            "data": {"status": "degraded"},
            "error": {"code": "DATABASE_UNAVAILABLE", "message": "Database is unavailable."},
        }

    return {"success": True, "data": {"status": "ready"}, "error": None}
