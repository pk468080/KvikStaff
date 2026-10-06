from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.modules.home.repository import HomeRepository


class HomeService:
    def __init__(
        self,
        repository: HomeRepository,
    ) -> None:
        self.repository = repository

    async def get_customer_favourite_service_ids(
        self,
        customer_id: UUID,
    ) -> list[str]:
        service_ids = (
            await self.repository
            .get_customer_favourite_service_ids(
                customer_id,
            )
        )

        return [
            str(service_id)
            for service_id in service_ids
        ]

    async def set_customer_favourite_service(
        self,
        customer_id: UUID,
        service_id: UUID,
        is_favourite: bool,
    ) -> dict[str, Any]:
        if is_favourite:
            await self.repository.add_customer_favourite_service(
                customer_id=customer_id,
                service_id=service_id,
            )
        else:
            await self.repository.remove_customer_favourite_service(
                customer_id=customer_id,
                service_id=service_id,
            )

        return {
            "service_id": str(service_id),
            "is_favourite": is_favourite,
        }

    async def get_home_promotions(
        self,
        available_service_ids: set[UUID] | None = None,
    ) -> list[dict[str, Any]]:
        rows = (
            await self.repository
            .get_active_home_promotions()
        )

        now = datetime.now(timezone.utc)

        result: list[dict[str, Any]] = []

        for row in rows:
            starts_at = row.get("starts_at")
            ends_at = row.get("ends_at")
            service_id = row.get("service_id")

            if (
                starts_at is not None
                and starts_at > now
            ):
                continue

            if (
                ends_at is not None
                and now >= ends_at
            ):
                continue

                        # When available_service_ids is supplied,
            # service-specific promotions must match
            # one of the currently available services.
            #
            # A promotion without a service_id is global.
            if (
                available_service_ids is not None
                and service_id is not None
                and service_id not in available_service_ids
            ):
                continue

            result.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "subtitle": row["subtitle"],
                    "cta_text": row["cta_text"],
                    "service_id": row["service_id"],
                    "image_url": row["image_url"],
                    "sort_order": row["sort_order"],
                }
            )

        return result

    async def get_customer_rebook_history(
        self,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        rows = (
            await self.repository
            .get_customer_rebook_rows(
                customer_id,
            )
        )

        seen: set[UUID] = set()
        result: list[dict[str, Any]] = []

        for row in rows:
            service_id = row.get("service_id")

            if (
                service_id is None
                or service_id in seen
            ):
                continue

            seen.add(service_id)

            result.append(
                {
                    "service_id": service_id,
                    "created_at": row["created_at"],
                    "duration_value": row["duration_value"],
                    "duration_unit": row["duration_unit"],
                    "scheduled_start": row["scheduled_start"],
                }
            )

        return result