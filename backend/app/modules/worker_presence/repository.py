import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class WorkerPresenceRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_presence(
        self,
        worker_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    worker_id,
                    is_available,
                    last_seen_at,
                    expires_at
                FROM public.worker_presence
                WHERE worker_id = :worker_id
                LIMIT 1
                """
            ),
            {
                "worker_id": str(worker_id),
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return dict(row)

    async def get_latest_location(
        self,
        worker_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    latitude,
                    longitude,
                    recorded_at
                FROM public.worker_locations
                WHERE worker_id = :worker_id
                  AND booking_id IS NULL
                ORDER BY recorded_at DESC
                LIMIT 1
                """
            ),
            {
                "worker_id": str(worker_id),
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return {
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
            "recorded_at": row["recorded_at"],
        }

    async def set_presence(
        self,
        worker_id: UUID,
        available: bool,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_auth_context(worker_id)

            result = await self.db.execute(
                text(
                    """
                    SELECT public.worker_set_presence(
                        :available
                    ) AS result
                    """
                ),
                {
                    "available": available,
                },
            )

            return self._to_dict(
                result.scalar_one()
            )

    async def heartbeat(
        self,
        worker_id: UUID,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_auth_context(worker_id)

            result = await self.db.execute(
                text(
                    """
                    SELECT public.worker_presence_heartbeat(
                        :latitude,
                        :longitude
                    ) AS result
                    """
                ),
                {
                    "latitude": latitude,
                    "longitude": longitude,
                },
            )

            return self._to_dict(
                result.scalar_one()
            )

    async def update_location(
        self,
        worker_id: UUID,
        latitude: float,
        longitude: float,
        booking_id: UUID | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_auth_context(worker_id)

            result = await self.db.execute(
                text(
                    """
                    SELECT public.worker_update_location(
                        :latitude,
                        :longitude,
                        CAST(:booking_id AS uuid)
                    ) AS result
                    """
                ),
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "booking_id": (
                        str(booking_id)
                        if booking_id is not None
                        else None
                    ),
                },
            )

            return self._to_dict(
                result.scalar_one()
            )

    async def _set_auth_context(
        self,
        worker_id: UUID,
    ) -> None:
        await self.db.execute(
            text(
                """
                SELECT set_config(
                    'request.jwt.claim.sub',
                    CAST(:worker_id AS text),
                    true
                )
                """
            ),
            {
                "worker_id": str(worker_id),
            },
        )

    @staticmethod
    def _to_dict(
        value: Any,
    ) -> dict[str, Any]:
        if isinstance(value, dict):
            return value

        if isinstance(value, str):
            parsed = json.loads(value)

            if isinstance(parsed, dict):
                return parsed

        if hasattr(value, "_mapping"):
            return dict(value._mapping)

        raise ValueError(
            "Worker presence function returned an invalid result."
        )