from datetime import date, datetime, time

from typing import Any

from uuid import UUID



from sqlalchemy import (

    Date,

    SmallInteger,

    Time,

    bindparam,

    text,

)

from sqlalchemy.dialects.postgresql import ARRAY

from sqlalchemy.ext.asyncio import AsyncSession





class BookingsRepository:





    def __init__(

        self,

        db: AsyncSession,

    ) -> None:

        self.db = db





    async def _set_customer_auth_context(

        self,

        customer_id: UUID,

    ) -> None:

        await self.db.execute(

            text(

                """

                SELECT set_config(

                    'request.jwt.claim.sub',

                    CAST(:customer_id AS text),

                    true

                )

                """

            ),

            {

                "customer_id": str(customer_id),

            },

        )



    async def calculate_customer_instant_booking_price(

        self,

        customer_id: UUID,

        service_variant_id: UUID,

        total_working_hours: float,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT public.calculate_service_booking_price(

                        CAST(:service_variant_id AS uuid),

                        :total_working_hours

                    ) AS result

                    """

                ),

                {

                    "service_variant_id": str(

                        service_variant_id

                    ),

                    "total_working_hours": (

                        total_working_hours

                    ),

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    async def calculate_customer_multi_occurrence_booking_price(

        self,

        customer_id: UUID,

        service_variant_id: UUID,

        schedule_start_date: date,

        schedule_end_date: date,

        daily_start_time: time,

        daily_end_time: time,

        selected_weekdays: list[int],

        off_dates: list[date],

        booking_type: str,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            query = text(

                """

                SELECT public.calculate_multi_occurrence_booking_price(

                    CAST(:service_variant_id AS uuid),

                    :schedule_start_date,

                    :schedule_end_date,

                    :daily_start_time,

                    :daily_end_time,

                    :selected_weekdays,

                    :off_dates,

                    CAST(

                        :booking_type

                        AS public.booking_fulfillment_type

                    )

                ) AS result

                """

            ).bindparams(

                bindparam(

                    "schedule_start_date",

                    type_=Date(),

                ),

                bindparam(

                    "schedule_end_date",

                    type_=Date(),

                ),

                bindparam(

                    "daily_start_time",

                    type_=Time(),

                ),

                bindparam(

                    "daily_end_time",

                    type_=Time(),

                ),

                bindparam(

                    "selected_weekdays",

                    type_=ARRAY(SmallInteger()),

                ),

                bindparam(

                    "off_dates",

                    type_=ARRAY(Date()),

                ),

            )



            result = await self.db.execute(

                query,

                {

                    "service_variant_id": str(

                        service_variant_id

                    ),

                    "schedule_start_date": (

                        schedule_start_date

                    ),

                    "schedule_end_date": (

                        schedule_end_date

                    ),

                    "daily_start_time": (

                        daily_start_time

                    ),

                    "daily_end_time": (

                        daily_end_time

                    ),

                    "selected_weekdays": (

                        selected_weekdays

                    ),

                    "off_dates": off_dates,

                    "booking_type": booking_type,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    async def create_hourly_booking(

        self,

        customer_id: UUID,

        service_variant_id: UUID,

        address_id: UUID,

        booking_type: str,

        scheduled_start: datetime,

        scheduled_end: datetime,

        notes: str | None,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT public.create_customer_hourly_booking(

                        CAST(:service_variant_id AS uuid),

                        CAST(:address_id AS uuid),

                        CAST(

                            :booking_type

                            AS public.booking_fulfillment_type

                        ),

                        CAST(:scheduled_start AS timestamptz),

                        CAST(:scheduled_end AS timestamptz),

                        :notes

                    ) AS result

                    """

                ),

                {

                    "service_variant_id": str(

                        service_variant_id

                    ),

                    "address_id": str(

                        address_id

                    ),

                    "booking_type": booking_type,

                    "scheduled_start": scheduled_start,

                    "scheduled_end": scheduled_end,

                    "notes": notes,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)





    async def create_multi_occurrence_booking(

        self,

        customer_id: UUID,

        service_variant_id: UUID,

        address_id: UUID,

        schedule_start_date: date,

        schedule_end_date: date,

        daily_start_time: time,

        daily_end_time: time,

        selected_weekdays: list[int],

        off_dates: list[date],

        notes: str | None,

        booking_type: str,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            if booking_type == "scheduled":

                function_name = (

                    "create_customer_scheduled_booking"

                )

            elif booking_type == "recurring":

                function_name = (

                    "create_customer_recurring_booking"

                )

            else:

                raise ValueError(

                    "Unsupported multi-occurrence booking type."

                )



            query = text(

                f"""

                SELECT public.{function_name}(

                    CAST(:service_variant_id AS uuid),

                    CAST(:address_id AS uuid),

                    :schedule_start_date,

                    :schedule_end_date,

                    :daily_start_time,

                    :daily_end_time,

                    :selected_weekdays,

                    :off_dates,

                    :notes

                ) AS result

                """

            ).bindparams(

                bindparam(

                    "schedule_start_date",

                    type_=Date(),

                ),

                bindparam(

                    "schedule_end_date",

                    type_=Date(),

                ),

                bindparam(

                    "daily_start_time",

                    type_=Time(),

                ),

                bindparam(

                    "daily_end_time",

                    type_=Time(),

                ),

                bindparam(

                    "selected_weekdays",

                    type_=ARRAY(SmallInteger()),

                ),

                bindparam(

                    "off_dates",

                    type_=ARRAY(Date()),

                ),

            )



            result = await self.db.execute(

                query,

                {

                    "service_variant_id": str(

                        service_variant_id

                    ),

                    "address_id": str(

                        address_id

                    ),

                    "schedule_start_date": (

                        schedule_start_date

                    ),

                    "schedule_end_date": (

                        schedule_end_date

                    ),

                    "daily_start_time": (

                        daily_start_time

                    ),

                    "daily_end_time": (

                        daily_end_time

                    ),

                    "selected_weekdays": (

                        selected_weekdays

                    ),

                    "off_dates": off_dates,

                    "notes": notes,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    async def get_customer_bookings(

        self,

        customer_id: UUID,

    ) -> list[dict[str, Any]]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT

                        b.id,

                        b.address_id,

                        b.status::text AS status,

                        b.fulfillment_type::text AS fulfillment_type,

                        b.scheduled_start,

                        b.scheduled_end,

                        CAST(

                            b.total_working_hours

                            AS double precision

                        ) AS total_working_hours,

                        CAST(

                            b.discount_amount

                            AS double precision

                        ) AS discount_amount,

                        CAST(

                            b.platform_fee

                            AS double precision

                        ) AS platform_fee,

                        CAST(

                            b.tax_amount

                            AS double precision

                        ) AS tax_amount,

                        CAST(

                            b.total_amount

                            AS double precision

                        ) AS total_amount,

                        b.worker_id,

                        b.started_at,

                        b.completed_at,

                        b.journey_started_at,

                        b.arrived_at,

                        b.created_at,

                        s.name AS service_name,

                        s.image_url AS service_image_url

                    FROM public.bookings AS b

                    LEFT JOIN public.service_variants AS sv

                        ON sv.id = b.service_variant_id

                    LEFT JOIN public.services AS s

                        ON s.id = sv.service_id

                    WHERE b.customer_id = :customer_id

                    ORDER BY b.created_at DESC

                    """

                ),

                {

                    "customer_id": str(customer_id),

                },

            )



            return [

                dict(row)

                for row in result.mappings().all()

            ]



    async def get_customer_booking(

        self,

        customer_id: UUID,

        booking_id: UUID,

    ) -> dict[str, Any] | None:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT

                        b.id,

                        b.address_id,

                        b.status::text AS status,

                        b.fulfillment_type::text AS fulfillment_type,

                        b.scheduled_start,

                        b.scheduled_end,

                        CAST(

                            b.total_working_hours

                            AS double precision

                        ) AS total_working_hours,

                        CAST(

                            b.discount_amount

                            AS double precision

                        ) AS discount_amount,

                        CAST(

                            b.platform_fee

                            AS double precision

                        ) AS platform_fee,

                        CAST(

                            b.tax_amount

                            AS double precision

                        ) AS tax_amount,

                        CAST(

                            b.total_amount

                            AS double precision

                        ) AS total_amount,

                        b.worker_id,

                        b.started_at,

                        b.completed_at,

                        b.journey_started_at,

                        b.arrived_at,

                        b.created_at,

                        s.name AS service_name,

                        s.image_url AS service_image_url

                    FROM public.bookings AS b

                    LEFT JOIN public.service_variants AS sv

                        ON sv.id = b.service_variant_id

                    LEFT JOIN public.services AS s

                        ON s.id = sv.service_id

                    WHERE b.customer_id = :customer_id

                      AND b.id = :booking_id

                    LIMIT 1

                    """

                ),

                {

                    "customer_id": str(customer_id),

                    "booking_id": str(booking_id),

                },

            )



            row = result.mappings().first()



            if row is None:

                return None



            return dict(row)



    async def get_customer_booking_occurrences(

        self,

        customer_id: UUID,

        booking_id: UUID,

    ) -> list[dict[str, Any]]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT

                        o.id,

                        o.booking_id,

                        o.worker_id,

                        o.occurrence_index,

                        o.occurrence_date,

                        o.scheduled_start,

                        o.scheduled_end,

                        o.status::text AS status,

                        o.journey_started_at,

                        o.arrived_at,

                        o.started_at,

                        o.completed_at,

                        o.start_otp_verified_at,

                        o.end_otp_verified_at,

                        o.created_at,

                        o.updated_at

                    FROM public.booking_schedule_occurrences AS o

                    INNER JOIN public.bookings AS b

                        ON b.id = o.booking_id

                    WHERE b.customer_id = :customer_id

                      AND o.booking_id = :booking_id

                    ORDER BY o.occurrence_index ASC

                    """

                ),

                {

                    "customer_id": str(customer_id),

                    "booking_id": str(booking_id),

                },

            )



            return [

                dict(row)

                for row in result.mappings().all()

            ]



    async def get_customer_booking_history(

        self,

        customer_id: UUID,

        booking_id: UUID,

    ) -> list[dict[str, Any]]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT

                        h.id,

                        h.booking_id,

                        h.old_status::text AS old_status,

                        h.new_status::text AS new_status,

                        h.changed_by,

                        h.created_at

                    FROM public.booking_status_history AS h

                    INNER JOIN public.bookings AS b

                        ON b.id = h.booking_id

                    WHERE b.customer_id = :customer_id

                      AND h.booking_id = :booking_id

                    ORDER BY h.created_at ASC

                    """

                ),

                {

                    "customer_id": str(customer_id),

                    "booking_id": str(booking_id),

                },

            )



            return [

                dict(row)

                for row in result.mappings().all()

            ]



    async def get_customer_booking_latest_worker_location(

        self,

        customer_id: UUID,

        booking_id: UUID,

    ) -> dict[str, Any] | None:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT

                        wl.latitude,

                        wl.longitude,

                        wl.recorded_at

                    FROM public.worker_locations AS wl

                    INNER JOIN public.bookings AS b

                        ON b.id = wl.booking_id

                    WHERE b.customer_id = :customer_id

                      AND wl.booking_id = :booking_id

                    ORDER BY wl.recorded_at DESC

                    LIMIT 1

                    """

                ),

                {

                    "customer_id": str(customer_id),

                    "booking_id": str(booking_id),

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



    async def create_customer_booking_otp(

        self,

        customer_id: UUID,

        booking_id: UUID,

        otp_type: str,

        occurrence_id: UUID | None,

    ) -> dict[str, Any]:

        import hashlib

        import secrets

        from datetime import timedelta



        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            booking_result = await self.db.execute(

                text(

                    """

                    SELECT

                        id,

                        customer_id,

                        worker_id,

                        status::text AS status,

                        fulfillment_type::text AS fulfillment_type

                    FROM public.bookings

                    WHERE id = :booking_id

                      AND customer_id = :customer_id

                    FOR UPDATE

                    """

                ),

                {

                    "booking_id": str(booking_id),

                    "customer_id": str(customer_id),

                },

            )



            booking = booking_result.mappings().first()



            if booking is None:

                raise ValueError(

                    "Booking not found."

                )



            fulfillment_type = str(

                booking["fulfillment_type"] or ""

            )



            if fulfillment_type == "recurring":

                if occurrence_id is None:

                    raise ValueError(

                        "occurrenceId is required for recurring bookings."

                    )



                occurrence_result = await self.db.execute(

                    text(

                        """

                        SELECT

                            id,

                            booking_id,

                            worker_id,

                            status::text AS status,

                            scheduled_start,

                            scheduled_end

                        FROM public.booking_schedule_occurrences

                        WHERE id = :occurrence_id

                          AND booking_id = :booking_id

                        FOR UPDATE

                        """

                    ),

                    {

                        "occurrence_id": str(

                            occurrence_id

                        ),

                        "booking_id": str(

                            booking_id

                        ),

                    },

                )



                occurrence = (

                    occurrence_result.mappings().first()

                )



                if occurrence is None:

                    raise ValueError(

                        "Booking occurrence not found."

                    )



                booking_worker_id = booking["worker_id"]

                occurrence_worker_id = (

                    occurrence["worker_id"]

                )



                if (

                    booking_worker_id is not None

                    and occurrence_worker_id is not None

                    and booking_worker_id

                    != occurrence_worker_id

                ):

                    raise ValueError(

                        "Booking occurrence worker assignment is invalid."

                    )



                occurrence_status = str(

                    occurrence["status"]

                )



                if (

                    otp_type == "start"

                    and occurrence_status != "arrived"

                ):

                    raise ValueError(

                        "Start OTP can only be generated after the worker has arrived."

                    )



                if (

                    otp_type == "end"

                    and occurrence_status != "in_progress"

                ):

                    raise ValueError(

                        "End OTP can only be generated while the service is in progress."

                    )



            else:

                if occurrence_id is not None:

                    raise ValueError(

                        "occurrenceId is only valid for recurring bookings."

                    )



                booking_status = str(

                    booking["status"]

                )



                if (

                    otp_type == "start"

                    and booking_status != "arrived"

                ):

                    raise ValueError(

                        "Start OTP can only be generated after the worker has arrived."

                    )



                if (

                    otp_type == "end"

                    and booking_status != "in_progress"

                ):

                    raise ValueError(

                        "End OTP can only be generated while the service is in progress."

                    )



            await self.db.execute(

                text(

                    """

                    UPDATE public.booking_otps

                    SET status = 'expired'

                    WHERE booking_id = :booking_id

                      AND otp_type = :otp_type

                      AND status = 'pending'

                      AND (

                            (

                                :occurrence_id IS NULL

                                AND occurrence_id IS NULL

                            )

                            OR

                            occurrence_id = :occurrence_id

                          )

                    """

                ),

                {

                    "booking_id": str(booking_id),

                    "otp_type": otp_type,

                    "occurrence_id": (

                        str(occurrence_id)

                        if occurrence_id

                        else None

                    ),

                },

            )



            otp = f"{secrets.randbelow(1_000_000):06d}"



            otp_hash = hashlib.sha256(

                otp.encode("utf-8")

            ).hexdigest()



            expires_at = (

                datetime.utcnow()

                + timedelta(minutes=15)

            )



            await self.db.execute(

                text(

                    """

                    INSERT INTO public.booking_otps (

                        booking_id,

                        occurrence_id,

                        otp_type,

                        otp_hash,

                        status,

                        attempts,

                        expires_at

                    )

                    VALUES (

                        CAST(:booking_id AS uuid),

                        CAST(:occurrence_id AS uuid),

                        :otp_type,

                        :otp_hash,

                        'pending',

                        0,

                        :expires_at

                    )

                    """

                ),

                {

                    "booking_id": str(booking_id),

                    "occurrence_id": (

                        str(occurrence_id)

                        if occurrence_id

                        else None

                    ),

                    "otp_type": otp_type,

                    "otp_hash": otp_hash,

                    "expires_at": expires_at,

                },

            )



            return {

                "success": True,

                "message": (

                    "OTP generated successfully. "

                    "Give this code to your worker."

                ),

                "otp": otp,

                "expiresAt": expires_at,

                "occurrence_id": (

                    str(occurrence_id)

                    if occurrence_id

                    else None

                ),

            }



    async def cancel_customer_booking(

        self,

        customer_id: UUID,

        booking_id: UUID,

        reason: str,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT public.cancel_customer_booking(

                        CAST(:booking_id AS uuid),

                        :reason

                    ) AS result

                    """

                ),

                {

                    "booking_id": str(booking_id),

                    "reason": reason,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    async def cancel_customer_booking_series(

        self,

        customer_id: UUID,

        booking_id: UUID,

        reason: str,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT public.cancel_customer_booking_series(

                        CAST(:booking_id AS uuid),

                        :reason

                    ) AS result

                    """

                ),

                {

                    "booking_id": str(booking_id),

                    "reason": reason,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    async def cancel_customer_booking_occurrence(

        self,

        customer_id: UUID,

        occurrence_id: UUID,

        reason: str,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT public.cancel_customer_booking_occurrence(

                        CAST(:occurrence_id AS uuid),

                        :reason

                    ) AS result

                    """

                ),

                {

                    "occurrence_id": str(

                        occurrence_id

                    ),

                    "reason": reason,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    async def get_customer_booking_refunds(

        self,

        customer_id: UUID,

        booking_id: UUID,

    ) -> list[dict[str, Any]]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT private.get_customer_booking_refunds(

                        CAST(:booking_id AS uuid)

                    ) AS result

                    """

                ),

                {

                    "booking_id": str(booking_id),

                },

            )



            value = result.scalar_one()



        return self._to_list(value)



    async def reschedule_customer_booking(

        self,

        customer_id: UUID,

        booking_id: UUID,

        new_start: datetime,

        new_end: datetime,

    ) -> dict[str, Any]:

        async with self.db.begin():

            await self._set_customer_auth_context(

                customer_id

            )



            result = await self.db.execute(

                text(

                    """

                    SELECT public.reschedule_customer_booking(

                        CAST(:booking_id AS uuid),

                        CAST(:new_start AS timestamptz),

                        CAST(:new_end AS timestamptz)

                    ) AS result

                    """

                ),

                {

                    "booking_id": str(

                        booking_id

                    ),

                    "new_start": new_start,

                    "new_end": new_end,

                },

            )



            value = result.scalar_one()



        return self._to_dict(value)



    @staticmethod

    def _to_dict(

        value: Any,

    ) -> dict[str, Any]:

        if isinstance(value, dict):

            return value



        if isinstance(value, str):

            import json



            parsed = json.loads(value)



            if isinstance(parsed, dict):

                return parsed



        raise ValueError(

            "Booking function returned an invalid result."

        )



    @staticmethod

    def _to_list(

        value: Any,

    ) -> list[dict[str, Any]]:

        if isinstance(value, list):

            return [

                item

                for item in value

                if isinstance(item, dict)

            ]



        if isinstance(value, str):

            import json



            parsed = json.loads(value)



            if isinstance(parsed, list):

                return [

                    item

                    for item in parsed

                    if isinstance(item, dict)

                ]



        raise ValueError(

            "Booking refund function returned an invalid result."

        )
