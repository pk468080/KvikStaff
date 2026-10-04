from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ServiceAreaRow:
    id: UUID
    service_id: UUID | None
    name: str
    city: str
    state: str
    center_latitude: float
    center_longitude: float
    radius_km: float


@dataclass(frozen=True)
class ServiceVariantContext:
    service_id: UUID


@dataclass(frozen=True)
class CustomerAddressRow:
    latitude: float
    longitude: float


@dataclass(frozen=True)
class InstantWorkerSnapshot:
    count: int
    nearest_worker_id: UUID | None
    nearest_distance_km: float | None


class AvailabilityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_active_service_areas(self) -> list[ServiceAreaRow]:
        result = await self.session.execute(
            text(
                """
                select
                    id,
                    service_id,
                    name,
                    city,
                    state,
                    center_latitude,
                    center_longitude,
                    radius_km
                from public.service_areas
                where is_active = true
                order by city asc, name asc
                """
            )
        )

        return [
            ServiceAreaRow(
                id=row.id,
                service_id=row.service_id,
                name=row.name,
                city=row.city,
                state=row.state,
                center_latitude=float(row.center_latitude),
                center_longitude=float(row.center_longitude),
                radius_km=float(row.radius_km),
            )
            for row in result.mappings()
        ]

    async def is_service_area_available(
        self,
        service_id: UUID,
        latitude: float,
        longitude: float,
    ) -> bool:
        result = await self.session.execute(
            text(
                """
                select exists (
                    select 1
                    from public.service_areas sa
                    where sa.is_active = true
                      and (
                          sa.service_id = :service_id
                          or sa.service_id is null
                      )
                      and st_dwithin(
                          st_setsrid(
                              st_makepoint(
                                  sa.center_longitude,
                                  sa.center_latitude
                              ),
                              4326
                          )::geography,
                          st_setsrid(
                              st_makepoint(
                                  :longitude,
                                  :latitude
                              ),
                              4326
                          )::geography,
                          sa.radius_km * 1000
                      )
                ) as available
                """
            ),
            {
                "service_id": service_id,
                "latitude": latitude,
                "longitude": longitude,
            },
        )

        return bool(result.scalar_one())

    async def get_active_hourly_service_variant(
        self,
        service_variant_id: UUID,
    ) -> ServiceVariantContext | None:
        result = await self.session.execute(
            text(
                """
                select sv.service_id
                from public.service_variants sv
                join public.services s
                    on s.id = sv.service_id
                where sv.id = :service_variant_id
                  and sv.is_active = true
                  and lower(sv.billing_type) = 'hourly'
                  and s.is_active = true
                limit 1
                """
            ),
            {"service_variant_id": service_variant_id},
        )

        service_id = result.scalar_one_or_none()

        return (
            ServiceVariantContext(service_id=service_id)
            if service_id is not None
            else None
        )

    async def get_active_service_variant(
        self,
        service_variant_id: UUID,
    ) -> ServiceVariantContext | None:
        result = await self.session.execute(
            text(
                """
                select service_id
                from public.service_variants
                where id = :service_variant_id
                  and is_active = true
                limit 1
                """
            ),
            {"service_variant_id": service_variant_id},
        )

        service_id = result.scalar_one_or_none()

        return (
            ServiceVariantContext(service_id=service_id)
            if service_id is not None
            else None
        )

    async def get_customer_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> CustomerAddressRow | None:
        result = await self.session.execute(
            text(
                """
                select
                    latitude,
                    longitude
                from public.addresses
                where id = :address_id
                  and user_id = :customer_id
                limit 1
                """
            ),
            {
                "address_id": address_id,
                "customer_id": customer_id,
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return CustomerAddressRow(
            latitude=float(row["latitude"]),
            longitude=float(row["longitude"]),
        )

    async def get_platform_setting_value(
        self,
        key: str,
        default: str,
    ) -> str:
        result = await self.session.execute(
            text(
                """
                select coalesce(
                    nullif(trim(value->>'value'), ''),
                    :default_value
                ) as setting_value
                from public.platform_settings
                where key = :key
                  and is_active = true
                order by updated_at desc
                limit 1
                """
            ),
            {
                "key": key,
                "default_value": default,
            },
        )

        value = result.scalar_one_or_none()

        return str(value) if value is not None else default

    async def get_instant_worker_snapshot(
        self,
        service_id: UUID,
        latitude: float,
        longitude: float,
    ) -> InstantWorkerSnapshot:
        result = await self.session.execute(
            text(
                """
                with candidates as (
                    select
                        wp.id as worker_id,
                        st_distance(
                            wl.location,
                            st_setsrid(
                                st_makepoint(
                                    :longitude,
                                    :latitude
                                ),
                                4326
                            )::geography
                        ) / 1000.0 as distance_km
                    from public.worker_profiles wp
                    join public.worker_services ws
                        on ws.worker_id = wp.id
                       and ws.service_id = :service_id
                    join public.worker_presence pr
                        on pr.worker_id = wp.id
                       and pr.is_available = true
                       and pr.expires_at > now()
                    join lateral (
                        select wl.location
                        from public.worker_locations wl
                        where wl.worker_id = wp.id
                          and wl.location is not null
                          and wl.recorded_at >= now() - interval '10 minutes'
                        order by wl.recorded_at desc
                        limit 1
                    ) wl on true
                    where wp.is_verified = true
                      and wp.worker_status =
                          'available'::public.worker_status
                      and wp.service_radius_km > 0
                      and st_dwithin(
                          wl.location,
                          st_setsrid(
                              st_makepoint(
                                  :longitude,
                                  :latitude
                              ),
                              4326
                          )::geography,
                          least(
                              wp.service_radius_km,
                              10
                          ) * 1000
                      )
                      and st_dwithin(
                          wl.location,
                          st_setsrid(
                              st_makepoint(
                                  :longitude,
                                  :latitude
                              ),
                              4326
                          )::geography,
                          10000
                      )
                )
                select
                    count(*)::integer as worker_count,
                    (
                        array_agg(
                            worker_id
                            order by distance_km asc, worker_id asc
                        )
                    )[1] as nearest_worker_id,
                    round(
                        min(distance_km)::numeric,
                        3
                    ) as nearest_distance_km
                from candidates
                """
            ),
            {
                "service_id": service_id,
                "latitude": latitude,
                "longitude": longitude,
            },
        )

        row = result.mappings().one()
        nearest_distance = row["nearest_distance_km"]

        return InstantWorkerSnapshot(
            count=int(row["worker_count"] or 0),
            nearest_worker_id=row["nearest_worker_id"],
            nearest_distance_km=(
                float(nearest_distance)
                if nearest_distance is not None
                else None
            ),
        )

    async def count_instant_slot_workers(
        self,
        service_id: UUID,
        latitude: float,
        longitude: float,
        start: datetime,
        end: datetime,
    ) -> int:
        result = await self.session.execute(
            text(
                """
                select count(*)::integer
                from public.worker_profiles wp
                join public.worker_services ws
                    on ws.worker_id = wp.id
                   and ws.service_id = :service_id
                join public.worker_presence pr
                    on pr.worker_id = wp.id
                   and pr.is_available = true
                   and pr.expires_at > now()
                join lateral (
                    select wl.location
                    from public.worker_locations wl
                    where wl.worker_id = wp.id
                      and wl.location is not null
                      and wl.recorded_at >= now() - interval '10 minutes'
                    order by wl.recorded_at desc
                    limit 1
                ) wl on true
                where wp.is_verified = true
                  and wp.worker_status =
                      'available'::public.worker_status
                  and wp.service_radius_km > 0
                  and st_dwithin(
                      wl.location,
                      st_setsrid(
                          st_makepoint(
                              :longitude,
                              :latitude
                          ),
                          4326
                      )::geography,
                      least(
                          wp.service_radius_km,
                          10
                      ) * 1000
                  )
                  and st_dwithin(
                      wl.location,
                      st_setsrid(
                          st_makepoint(
                              :longitude,
                              :latitude
                          ),
                          4326
                      )::geography,
                      10000
                  )
                  and public.worker_covers_booking_interval(
                      :service_id,
                      wp.id,
                      :start_time,
                      :end_time
                  )
                  and not exists (
                      select 1
                      from public.bookings b
                      where b.worker_id = wp.id
                        and b.status in (
                            'assigned'::public.booking_status,
                            'on_the_way'::public.booking_status,
                            'arrived'::public.booking_status,
                            'in_progress'::public.booking_status
                        )
                        and b.scheduled_start < :end_time
                        and b.scheduled_end > :start_time
                  )
                """
            ),
            {
                "service_id": service_id,
                "latitude": latitude,
                "longitude": longitude,
                "start_time": start,
                "end_time": end,
            },
        )

        return int(result.scalar_one() or 0)

    async def count_scheduled_workers(
        self,
        service_id: UUID,
        start: datetime,
        end: datetime,
    ) -> int:
        result = await self.session.execute(
            text(
                """
                select count(*)::integer
                from public.worker_services ws
                join public.worker_profiles wp
                    on wp.id = ws.worker_id
                where ws.service_id = :service_id
                  and wp.is_verified = true
                  and wp.worker_status <>
                      'suspended'::public.worker_status
                  and public.worker_covers_booking_interval(
                      :service_id,
                      ws.worker_id,
                      :start_time,
                      :end_time
                  )
                """
            ),
            {
                "service_id": service_id,
                "start_time": start,
                "end_time": end,
            },
        )

        return int(result.scalar_one() or 0)