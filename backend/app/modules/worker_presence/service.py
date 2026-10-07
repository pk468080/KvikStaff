from uuid import UUID

from app.core.exceptions import AppError
from app.modules.worker_presence.repository import (
    WorkerPresenceRepository,
)
from app.modules.worker_presence.schemas import (
    WorkerLocationResponse,
    WorkerPresenceResponse,
)


class WorkerPresenceService:

    def __init__(
        self,
        repository: WorkerPresenceRepository,
    ) -> None:
        self.repository = repository

    async def get_presence(
        self,
        worker_id: UUID,
    ) -> WorkerPresenceResponse | None:
        presence = await self.repository.get_presence(
            worker_id
        )

        if presence is None:
            return None

        location = await self.repository.get_latest_location(
            worker_id
        )

        return self._map_presence(
            presence,
            location,
        )

    async def set_presence(
        self,
        worker_id: UUID,
        available: bool,
    ) -> WorkerPresenceResponse:
        result = await self.repository.set_presence(
            worker_id,
            available,
        )

        if result.get("success") is not True:
            raise AppError(
                "WORKER_PRESENCE_UPDATE_FAILED",
                "Worker presence could not be updated.",
                400,
            )

        presence = await self.get_presence(
            worker_id
        )

        if presence is None:
            raise AppError(
                "WORKER_PRESENCE_NOT_FOUND",
                "Worker presence could not be loaded.",
                500,
            )

        return presence

    async def heartbeat(
        self,
        worker_id: UUID,
        latitude: float,
        longitude: float,
    ) -> WorkerPresenceResponse:
        result = await self.repository.heartbeat(
            worker_id,
            latitude,
            longitude,
        )

        if result.get("success") is not True:
            raise AppError(
                "WORKER_PRESENCE_HEARTBEAT_FAILED",
                "Worker presence heartbeat failed.",
                400,
            )

        presence = await self.get_presence(
            worker_id
        )

        if presence is None:
            raise AppError(
                "WORKER_PRESENCE_NOT_FOUND",
                "Worker presence could not be loaded.",
                500,
            )

        return presence

    async def update_location(
        self,
        worker_id: UUID,
        latitude: float,
        longitude: float,
        booking_id: UUID | None,
    ) -> WorkerLocationResponse:
        result = await self.repository.update_location(
            worker_id,
            latitude,
            longitude,
            booking_id,
        )

        if result.get("success") is not True:
            raise AppError(
                "WORKER_LOCATION_UPDATE_FAILED",
                "Worker location could not be updated.",
                400,
            )

        if (
            not isinstance(result.get("latitude"), (int, float))
            or not isinstance(
                result.get("longitude"),
                (int, float),
            )
            or not result.get("recorded_at")
        ):
            raise AppError(
                "INVALID_WORKER_LOCATION_RESULT",
                "Worker location update returned invalid data.",
                500,
            )

        return WorkerLocationResponse(
            latitude=float(result["latitude"]),
            longitude=float(result["longitude"]),
            recorded_at=result["recorded_at"],
        )

    @staticmethod
    def _map_presence(
        presence: dict,
        location: dict | None,
    ) -> WorkerPresenceResponse:
        status = (
            "available"
            if presence["is_available"]
            else "offline"
        )

        return WorkerPresenceResponse(
            worker_id=presence["worker_id"],
            status=status,
            latitude=(
                location["latitude"]
                if location
                else None
            ),
            longitude=(
                location["longitude"]
                if location
                else None
            ),
            last_heartbeat_at=presence[
                "last_seen_at"
            ],
            presence_expires_at=presence[
                "expires_at"
            ],
        )
    async def get_latest_location(
        self,
        worker_id: UUID,
    ) -> WorkerLocationResponse | None:
        location = (
            await self.repository.get_latest_location_any_booking(
                worker_id
            )
        )

        if location is None:
            return None

        return WorkerLocationResponse(
            latitude=location["latitude"],
            longitude=location["longitude"],
            recorded_at=location["recorded_at"],
        )
    