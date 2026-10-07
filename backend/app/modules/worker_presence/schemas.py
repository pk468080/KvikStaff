from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WorkerPresenceResponse(BaseModel):
    worker_id: UUID
    status: str
    latitude: float | None = None
    longitude: float | None = None
    last_heartbeat_at: datetime | None = None
    presence_expires_at: datetime | None = None


class SetWorkerPresenceRequest(BaseModel):
    available: bool


class WorkerLocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    booking_id: UUID | None = None


class WorkerLocationResponse(BaseModel):
    latitude: float
    longitude: float
    recorded_at: datetime


class WorkerPresenceHeartbeatRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)