#!/usr/bin/env python3
"""Apply KvikStaff booking-only location persistence safely.

Run from the repository root on a feature branch (never on main):
  python3 /path/to/apply_customer_booking_location_history.py

The script changes only expected, anchored source sections. It validates every
source transformation in memory before writing any file. It does not call the
network, edit production configuration, or run database migrations.
"""
from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path.cwd()


def stop(message: str) -> None:
    raise SystemExit(f"STOP: {message}\nNo files were written.")


def replace_once(source: str, old: str, new: str, label: str, expected: int = 1) -> str:
    found = source.count(old)
    if found != expected:
        stop(f"{label}: expected {expected} exact anchor(s), found {found}. Your source may differ from reviewed main.")
    return source.replace(old, new)


def regex_replace_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, found = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE | re.DOTALL)
    if found != 1:
        stop(f"{label}: expected one matching section, found {found}. Your source may differ from reviewed main.")
    return updated


def read_file(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        stop(f"Expected file not found: {relative}")
    return path.read_text(encoding="utf-8")


def prepare(relative: str, transform) -> None:
    original = read_file(relative)
    updated = transform(original)
    if updated == original:
        stop(f"No change was prepared for {relative}; refusing a no-op patch.")
    PREPARED[relative] = updated


# Guard against accidentally applying this multi-file change to the production branch.
if not (ROOT / ".git").exists():
    stop("Run this script from the KvikStaff repository root (the folder containing .git).")
try:
    branch = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
except (OSError, subprocess.CalledProcessError) as exc:
    stop(f"Unable to identify the current Git branch: {exc}")
if branch != "feat/customer-booking-location-history":
    stop("Switch to feat/customer-booking-location-history before applying this patch. Do not run it on main or another work branch.")
if not branch:
    stop("Git did not return a current branch name (detached HEAD). Switch to a feature branch first.")

PREPARED: dict[str, str] = {}

# ---------------------------------------------------------------------------
# 1) RootNavigator: location selection updates app state only; it never saves.
# ---------------------------------------------------------------------------
def transform_root(c: str) -> str:
    c = replace_once(
        c,
        "import {\n  getOrCreateCustomerAddress,\n} from '../services/addresses/customerAddress.service'\n\n",
        "",
        "RootNavigator address-service import",
    )
    c = replace_once(
        c,
        """    /*
     * Save the customer's first/current service
     * location in Supabase.
     */
    await getOrCreateCustomerAddress({
      latitude,
      longitude,
      address: locationAddress,
      label: 'Current',
    })

""",
        """    // GPS discovery selects the active service location only.
    // The address is persisted atomically when a booking is created.
""",
        "RootNavigator first-location persistence",
    )
    c = replace_once(
        c,
        """    /*
     * Every location selected from Home is also
     * persisted so it can be reused later.
     */
    try {
      await getOrCreateCustomerAddress({
        latitude,
        longitude,
        address: locationAddress,
        label: 'Saved location',
      })
    } catch (error) {
      /*
       * Do not block the customer from using the
       * newly selected location if persistence fails.
       */
      console.error(
        'Unable to save customer location:',
        error,
      )
    }

""",
        """    // Manual, GPS, and previous-booking selections are in-memory choices.
    // Only the booking transaction persists a location.

""",
        "RootNavigator selected-location persistence",
    )
    return c

prepare("customer-app/navigation/RootNavigator.tsx", transform_root)

# ---------------------------------------------------------------------------
# 2) Frontend booking location type and booking payloads.
# ---------------------------------------------------------------------------
def transform_booking_types(c: str) -> str:
    c = replace_once(
        c,
        """export type BookingType =
  | 'instant'
  | 'scheduled'
  | 'recurring'

""",
        """export type BookingType =
  | 'instant'
  | 'scheduled'
  | 'recurring'

export type BookingLocationInput = {
  latitude: number
  longitude: number
  address: string
}

""",
        "booking location type insertion",
    )
    c = replace_once(
        c,
        """  location: {
    latitude: number
    longitude: number
    address: string
  }
""",
        "  location: BookingLocationInput\n",
        "BookingDraft location type",
    )
    c = replace_once(
        c,
        """export type MultiOccurrenceBookingInput =
  BookingScheduleInput & {
    addressId: string
    notes?: string | null
  }
""",
        """export type MultiOccurrenceBookingInput =
  BookingScheduleInput & {
    location: BookingLocationInput
    notes?: string | null
  }
""",
        "MultiOccurrenceBookingInput address field",
    )
    return c

prepare("customer-app/types/booking.ts", transform_booking_types)


def transform_instant_booking_service(c: str) -> str:
    c = replace_once(
        c,
        "import type { BookingCreationResult } from '../../types/booking'",
        "import type { BookingCreationResult, BookingLocationInput } from '../../types/booking'",
        "instant booking type import",
    )
    c = replace_once(
        c,
        "  addressId: string\n",
        "  location: BookingLocationInput\n",
        "instant booking addressId input",
    )
    c = replace_once(
        c,
        """          address_id:
            input.addressId,
""",
        """          location: {
            latitude: input.location.latitude,
            longitude: input.location.longitude,
            address: input.location.address,
          },
""",
        "instant booking payload address_id",
    )
    return c

prepare("customer-app/services/booking/instantBooking.service.ts", transform_instant_booking_service)


def transform_scheduled_booking_service(c: str) -> str:
    c = replace_once(
        c,
        """          address_id:
            input.addressId,
""",
        """          location: {
            latitude: input.location.latitude,
            longitude: input.location.longitude,
            address: input.location.address,
          },
""",
        "scheduled booking payload address_id",
    )
    return c

prepare("customer-app/services/booking/scheduledBooking.service.ts", transform_scheduled_booking_service)


def transform_recurring_booking_service(c: str) -> str:
    c = replace_once(
        c,
        """          address_id:
            input.addressId,
""",
        """          location: {
            latitude: input.location.latitude,
            longitude: input.location.longitude,
            address: input.location.address,
          },
""",
        "recurring booking payload address_id",
    )
    return c

prepare("customer-app/services/booking/recurringBooking.service.ts", transform_recurring_booking_service)


def transform_customer_navigator(c: str) -> str:
    c = replace_once(
        c,
        "import {\n  getOrCreateCustomerAddress,\n} from '../services/addresses/customerAddress.service'\n",
        "",
        "CustomerNavigator address-service import",
    )
    c = replace_once(
        c,
        """            const addressId =
              await getOrCreateCustomerAddress(
                draft.location,
              )

""",
        """            // The backend creates/reuses this address inside the same
            // database transaction as the booking.

""",
        "CustomerNavigator pre-booking address creation",
    )
    c = replace_once(
        c,
        "      addressId,\n      startTime:",
        "      location: draft.location,\n      startTime:",
        "instant booking location argument",
    )
    c = replace_once(
        c,
        "                    addressId,\n                    startDate:",
        "                    location: draft.location,\n                    startDate:",
        "scheduled booking location argument",
    )
    c = replace_once(
        c,
        "                  addressId,\n                  startDate:",
        "                  location: draft.location,\n                  startDate:",
        "recurring booking location argument",
    )
    return c

prepare("customer-app/navigation/CustomerNavigator.tsx", transform_customer_navigator)

# ---------------------------------------------------------------------------
# 3) Availability uses coordinates and never creates an address record.
# ---------------------------------------------------------------------------
def transform_instant_slots_service(c: str) -> str:
    c = replace_once(
        c,
        "import { apiRequest } from '../../lib/api'\n",
        "import { apiRequest } from '../../lib/api'\nimport type { BookingLocationInput } from '../../types/booking'\n",
        "instant availability service imports",
    )
    c = replace_once(
        c,
        """export async function getInstantAvailabilitySlots(
  serviceVariantId: string,
  addressId: string,
  durationHours = 1,
): Promise<InstantAvailabilityResult> {""",
        """export async function getInstantAvailabilitySlots(
  serviceVariantId: string,
  location: Pick<BookingLocationInput, 'latitude' | 'longitude'>,
  durationHours = 1,
): Promise<InstantAvailabilityResult> {""",
        "instant availability function signature",
    )
    c = replace_once(
        c,
        """  if (!addressId.trim()) {
    throw new Error(
      'Address ID is required.',
    )
  }

""",
        """  if (
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw new Error('A valid service location is required.')
  }

""",
        "instant availability address id validation",
    )
    c = replace_once(
        c,
        """          address_id: addressId,
""",
        """          latitude: location.latitude,
          longitude: location.longitude,
""",
        "instant availability request payload address_id",
    )
    return c

prepare("customer-app/services/availability/instantSlotAvailability.service.ts", transform_instant_slots_service)


def transform_booking_screen(c: str) -> str:
    c = replace_once(
        c,
        "import {\n  getOrCreateCustomerAddress,\n} from '../../services/addresses/customerAddress.service'\n\n",
        "",
        "BookingScreen address-service import",
    )
    c = replace_once(
        c,
        """        const addressId =
          await getOrCreateCustomerAddress(
            location,
          )

        const result =
          await getInstantAvailabilitySlots(
            service.serviceVariantId,
            addressId,
            durationHours,
          )""",
        """        const result =
          await getInstantAvailabilitySlots(
            service.serviceVariantId,
            {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            durationHours,
          )""",
        "BookingScreen instant-slot address creation",
    )
    return c

prepare("customer-app/screens/bookings/BookingScreen.tsx", transform_booking_screen)

# ---------------------------------------------------------------------------
# 4) Home: automatically fetched GPS remains unchanged; previous booking
#    locations are loaded only when the picker opens and may be selected.
# ---------------------------------------------------------------------------
def transform_home(c: str) -> str:
    c = replace_once(
        c,
        "import { geocodeCustomerAddress } from '../../services/addresses/customerGeocoding.service'\n",
        """import { geocodeCustomerAddress } from '../../services/addresses/customerGeocoding.service'
import {
  getCustomerBookingLocations,
  type CustomerSavedAddress,
} from '../../services/addresses/customerAddress.service'
""",
        "HomeScreen address imports",
    )
    c = replace_once(
        c,
        "  const [locationQuery, setLocationQuery] = useState('')\n",
        """  const [locationQuery, setLocationQuery] = useState('')
  const [bookingLocations, setBookingLocations] = useState<CustomerSavedAddress[]>([])
  const [bookingLocationsLoading, setBookingLocationsLoading] = useState(false)
""",
        "HomeScreen booking-location state",
    )
    c = replace_once(
        c,
        """    async function handleSearchLocation() {
""",
        """  async function handleSelectBookingLocation(
    savedLocation: CustomerSavedAddress,
  ) {
    setLocationError('')
    setAddress(savedLocation.addressLine)

    try {
      await onLocationChange(
        savedLocation.latitude,
        savedLocation.longitude,
        savedLocation.addressLine,
      )
      setLocationQuery('')
      setLocationPickerVisible(false)
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : 'Unable to select this previous booking location.',
      )
    }
  }

  async function handleSearchLocation() {
""",
        "HomeScreen saved-location handler",
    )
    c = replace_once(
        c,
        """  useEffect(() => {
    if (
      location ||
      automaticLocationRequestStarted.current
""",
        """  useEffect(() => {
    if (!locationPickerVisible) {
      return
    }

    let active = true
    setBookingLocationsLoading(true)

    void getCustomerBookingLocations()
      .then(nextLocations => {
        if (active) {
          setBookingLocations(nextLocations)
        }
      })
      .catch(error => {
        console.warn('Unable to load previous booking locations:', error)
        if (active) {
          setBookingLocations([])
        }
      })
      .finally(() => {
        if (active) {
          setBookingLocationsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [locationPickerVisible])

  useEffect(() => {
    if (
      location ||
      automaticLocationRequestStarted.current
""",
        "HomeScreen booking-location loading effect",
    )
    c = replace_once(
        c,
        """            <View style={styles.modalTip}>
""",
        """            {bookingLocationsLoading ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null}

            {bookingLocations.length > 0 ? (
              <View style={{ marginTop: 18, gap: 8 }}>
                <Text
                  style={{
                    color: '#62788A',
                    fontSize: 10,
                    fontWeight: '800',
                    letterSpacing: 1,
                  }}
                >
                  PREVIOUS BOOKING LOCATIONS
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                >
                  {bookingLocations.map(savedLocation => (
                    <TouchableOpacity
                      key={savedLocation.id}
                      style={{
                        width: 205,
                        padding: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: '#DCE6EF',
                        backgroundColor: '#F8FBFD',
                      }}
                      activeOpacity={0.84}
                      onPress={() => {
                        void handleSelectBookingLocation(savedLocation)
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CustomerIcon
                          name="location"
                          size={15}
                          color={COLORS.primaryDark}
                        />
                        <Text
                          style={{
                            color: COLORS.primaryDark,
                            fontSize: 10,
                            fontWeight: '800',
                          }}
                        >
                          BOOKED LOCATION
                        </Text>
                      </View>
                      <Text
                        numberOfLines={2}
                        style={{
                          marginTop: 7,
                          color: '#17354A',
                          fontSize: 12,
                          lineHeight: 17,
                          fontWeight: '700',
                        }}
                      >
                        {savedLocation.addressLine}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.modalTip}>
""",
        "HomeScreen previous-booking location selector UI",
    )
    return c

prepare("customer-app/screens/home/HomeScreen.tsx", transform_home)

# ---------------------------------------------------------------------------
# 5) Saved booking locations endpoint/service; preserve legacy address list and
#    delete behavior by adding a separate read-only history path.
# ---------------------------------------------------------------------------
def transform_address_frontend_service(c: str) -> str:
    anchor = """export async function getLatestCustomerAddress(): Promise<
  CustomerSavedAddress | null
> {"""
    insertion = """export async function getCustomerBookingLocations(): Promise<
  CustomerSavedAddress[]
> {
  const response = await apiRequest<CustomerAddressApiResponse[]>(
    '/addresses/booking-locations',
    { method: 'GET' },
  )

  return (response ?? []).map(mapAddress)
}

"""
    return replace_once(c, anchor, insertion + anchor, "booking-location service insertion")

prepare("customer-app/services/addresses/customerAddress.service.ts", transform_address_frontend_service)

# ---------------------------------------------------------------------------
# 6) Backend request schemas support either legacy address_id or an inline
#    location that will be persisted inside the booking transaction.
# ---------------------------------------------------------------------------
def transform_booking_schemas(c: str) -> str:
    c = replace_once(
        c,
        "from pydantic import BaseModel, Field, field_validator\n",
        "from pydantic import BaseModel, Field, field_validator, model_validator\n",
        "booking schema pydantic imports",
    )
    base = """class CustomerBookingLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str = Field(min_length=1, max_length=500)

    @field_validator("address")
    @classmethod
    def normalize_address(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A booking address is required.")
        return value


class BookingAddressRequest(BaseModel):
    # address_id remains supported for older installed app versions.
    address_id: UUID | None = None
    location: CustomerBookingLocation | None = None

    @model_validator(mode="after")
    def validate_address_source(self):
        if (self.address_id is None) == (self.location is None):
            raise ValueError("Provide either address_id or location, but not both.")
        return self


"""
    c = replace_once(
        c,
        "class InstantBookingCreateRequest(BaseModel):\n",
        base + "class InstantBookingCreateRequest(BookingAddressRequest):\n",
        "instant booking address base class",
    )
    c = replace_once(
        c,
        """class InstantBookingCreateRequest(BookingAddressRequest):
    service_variant_id: UUID
    address_id: UUID
""",
        """class InstantBookingCreateRequest(BookingAddressRequest):
    service_variant_id: UUID
""",
        "instant booking duplicate address_id",
    )
    c = replace_once(
        c,
        """class MultiOccurrenceBookingCreateRequest(BaseModel):
    service_variant_id: UUID
    address_id: UUID
""",
        """class MultiOccurrenceBookingCreateRequest(BookingAddressRequest):
    service_variant_id: UUID
""",
        "multi-occurrence booking request inheritance/address_id",
    )
    return c

prepare("backend/app/modules/bookings/schemas.py", transform_booking_schemas)

# ---------------------------------------------------------------------------
# 7) Booking repository: create/reuse address inside each existing booking
#    transaction, so failed booking creation rolls the address insert back.
# ---------------------------------------------------------------------------
def transform_booking_repository(c: str) -> str:
    helper = '''    async def _resolve_customer_address_id(
        self,
        *,
        customer_id: UUID,
        address_id: UUID | None,
        location: dict[str, Any] | None,
    ) -> tuple[UUID, bool]:
        """Return (address ID, whether a new row was inserted) in this transaction."""
        if address_id is not None:
            result = await self.db.execute(
                text(
                    """
                    SELECT id
                    FROM public.addresses
                    WHERE id = :address_id
                      AND user_id = :customer_id
                    LIMIT 1
                    """
                ),
                {"address_id": address_id, "customer_id": customer_id},
            )
            owned_id = result.scalar_one_or_none()
            if owned_id is None:
                raise ValueError("The booking address does not belong to this customer.")
            return owned_id, False

        if location is None:
            raise ValueError("A booking location is required.")

        address_line = str(location.get("address", "")).strip()
        latitude = float(location["latitude"])
        longitude = float(location["longitude"])
        if not address_line:
            raise ValueError("A booking address is required.")
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("The booking location coordinates are invalid.")

        existing = await self.db.execute(
            text(
                """
                SELECT id
                FROM public.addresses
                WHERE user_id = :customer_id
                  AND address_line = :address_line
                  AND latitude = :latitude
                  AND longitude = :longitude
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {
                "customer_id": customer_id,
                "address_line": address_line,
                "latitude": latitude,
                "longitude": longitude,
            },
        )
        existing_id = existing.scalar_one_or_none()
        if existing_id is not None:
            return existing_id, False

        inserted = await self.db.execute(
            text(
                """
                INSERT INTO public.addresses (
                    user_id, label, address_line, latitude, longitude, location
                )
                VALUES (
                    :customer_id,
                    'Booking location',
                    :address_line,
                    :latitude,
                    :longitude,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
                )
                RETURNING id
                """
            ),
            {
                "customer_id": customer_id,
                "address_line": address_line,
                "latitude": latitude,
                "longitude": longitude,
            },
        )
        return inserted.scalar_one(), True

'''
    # Replace the two methods as whole sections to avoid inheriting legacy whitespace noise.
    c = regex_replace_once(
        c,
        r"    async def create_hourly_booking\([\s\S]*?(?=    async def create_multi_occurrence_booking\()",
        helper + '''    async def create_hourly_booking(
        self,
        customer_id: UUID,
        service_variant_id: UUID,
        address_id: UUID | None,
        location: dict[str, Any] | None,
        booking_type: str,
        scheduled_start: datetime,
        scheduled_end: datetime,
        notes: str | None,
        idempotency_key: str,
        request_hash: str,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(customer_id)

            acquired, existing_response = await claim_or_replay(
                self.db,
                user_id=customer_id,
                action=f"create_{booking_type}_booking",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
            if not acquired:
                return existing_response

            resolved_address_id, address_was_inserted = await self._resolve_customer_address_id(
                customer_id=customer_id,
                address_id=address_id,
                location=location,
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.create_customer_hourly_booking(
                        CAST(:service_variant_id AS uuid),
                        CAST(:address_id AS uuid),
                        CAST(:booking_type AS public.booking_fulfillment_type),
                        CAST(:scheduled_start AS timestamptz),
                        CAST(:scheduled_end AS timestamptz),
                        :notes
                    ) AS result
                    """
                ),
                {
                    "service_variant_id": str(service_variant_id),
                    "address_id": str(resolved_address_id),
                    "booking_type": booking_type,
                    "scheduled_start": scheduled_start,
                    "scheduled_end": scheduled_end,
                    "notes": notes,
                },
            )
            result_dict = self._to_dict(result.scalar_one())

            # An instant request can return a valid fallback response without
            # creating a booking. Do not keep the temporary address in that case.
            if address_was_inserted and (
                result_dict.get("fallback_to_scheduled") is True
                or result_dict.get("instant_available") is False
            ):
                await self.db.execute(
                    text(
                        """
                        DELETE FROM public.addresses AS a
                        WHERE a.id = :address_id
                          AND a.user_id = :customer_id
                          AND NOT EXISTS (
                              SELECT 1
                              FROM public.bookings b
                              WHERE b.address_id = a.id
                                AND b.customer_id = :customer_id
                          )
                        """
                    ),
                    {"address_id": resolved_address_id, "customer_id": customer_id},
                )

            await complete_idempotency(
                self.db,
                user_id=customer_id,
                action=f"create_{booking_type}_booking",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=result_dict,
            )

        return result_dict


''',
        "hourly booking repository method",
    )
    c = regex_replace_once(
        c,
        r"    async def create_multi_occurrence_booking\([\s\S]*?(?=    async def get_customer_bookings\()",
        '''    async def create_multi_occurrence_booking(
        self,
        customer_id: UUID,
        service_variant_id: UUID,
        address_id: UUID | None,
        location: dict[str, Any] | None,
        schedule_start_date: date,
        schedule_end_date: date,
        daily_start_time: time,
        daily_end_time: time,
        selected_weekdays: list[int],
        off_dates: list[date],
        notes: str | None,
        booking_type: str,
        idempotency_key: str,
        request_hash: str,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(customer_id)

            acquired, existing_response = await claim_or_replay(
                self.db,
                user_id=customer_id,
                action=f"create_{booking_type}_booking",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
            if not acquired:
                return existing_response

            resolved_address_id, _address_was_inserted = await self._resolve_customer_address_id(
                customer_id=customer_id,
                address_id=address_id,
                location=location,
            )

            if booking_type == "scheduled":
                function_name = "create_customer_scheduled_booking"
            elif booking_type == "recurring":
                function_name = "create_customer_recurring_booking"
            else:
                raise ValueError("Unsupported multi-occurrence booking type.")

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
                bindparam("schedule_start_date", type_=Date()),
                bindparam("schedule_end_date", type_=Date()),
                bindparam("daily_start_time", type_=Time()),
                bindparam("daily_end_time", type_=Time()),
                bindparam("selected_weekdays", type_=ARRAY(SmallInteger())),
                bindparam("off_dates", type_=ARRAY(Date())),
            )

            result = await self.db.execute(
                query,
                {
                    "service_variant_id": str(service_variant_id),
                    "address_id": str(resolved_address_id),
                    "schedule_start_date": schedule_start_date,
                    "schedule_end_date": schedule_end_date,
                    "daily_start_time": daily_start_time,
                    "daily_end_time": daily_end_time,
                    "selected_weekdays": selected_weekdays,
                    "off_dates": off_dates,
                    "notes": notes,
                },
            )
            result_dict = self._to_dict(result.scalar_one())
            await complete_idempotency(
                self.db,
                user_id=customer_id,
                action=f"create_{booking_type}_booking",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=result_dict,
            )

        return result_dict


''',
        "multi-occurrence booking repository method",
    )
    return c

prepare("backend/app/modules/bookings/repository.py", transform_booking_repository)

# ---------------------------------------------------------------------------
# 8) Booking service passes optional location through to the atomic repository.
# ---------------------------------------------------------------------------
def transform_booking_service(c: str) -> str:
    # There are three create calls (instant, scheduled, recurring).
    c = replace_once(
        c,
        "    address_id=request.address_id,\n    booking_type=\"instant\",",
        "    address_id=request.address_id,\n    location=request.location.model_dump() if request.location else None,\n    booking_type=\"instant\",",
        "instant booking service location forwarding",
    )
    c = replace_once(
        c,
        "                    address_id=request.address_id,\n                    schedule_start_date=(\n",
        "                    address_id=request.address_id,\n                    location=request.location.model_dump() if request.location else None,\n                    schedule_start_date=(\n",
        "scheduled and recurring booking service location forwarding",
        expected=2,
    )
    return c

prepare("backend/app/modules/bookings/service.py", transform_booking_service)

# ---------------------------------------------------------------------------
# 9) Instant slot availability accepts coordinates without creating an address.
#    address_id remains supported for older app versions.
# ---------------------------------------------------------------------------
def transform_availability_schemas(c: str) -> str:
    c = replace_once(
        c,
        "from pydantic import BaseModel, Field, field_validator\n",
        "from pydantic import BaseModel, Field, field_validator, model_validator\n",
        "availability schema pydantic imports",
    )
    c = replace_once(
        c,
        """class InstantAvailabilitySlotsRequest(BaseModel):
    service_variant_id: UUID
    address_id: UUID
    duration_hours: float = Field(
        default=1,
        ge=1,
        le=24,
    )
""",
        """class InstantAvailabilitySlotsRequest(BaseModel):
    service_variant_id: UUID
    # address_id is retained for clients that have not yet upgraded.
    address_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    duration_hours: float = Field(
        default=1,
        ge=1,
        le=24,
    )

    @model_validator(mode="after")
    def validate_location_source(self):
        has_coordinates = self.latitude is not None and self.longitude is not None
        if self.address_id is not None and (self.latitude is not None or self.longitude is not None):
            raise ValueError("Provide address_id or coordinates, not both.")
        if self.address_id is None and not has_coordinates:
            raise ValueError("Provide address_id or both latitude and longitude.")
        return self
""",
        "instant availability request schema",
    )
    return c

prepare("backend/app/modules/availability/schemas.py", transform_availability_schemas)


def transform_availability_service(c: str) -> str:
    c = replace_once(
        c,
        """        customer_id: UUID,
    ) -> InstantAvailabilitySlotsResponse:
        service_context = await self.repository.get_active_hourly_service_variant(
""",
        """        customer_id: UUID,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> InstantAvailabilitySlotsResponse:
        service_context = await self.repository.get_active_hourly_service_variant(
""",
        "instant availability service signature",
    )
    c = replace_once(
        c,
        """        address = await self.repository.get_customer_address(
            address_id,
            customer_id,
        )

        if address is None:
            raise AppError(
                "INVALID_CUSTOMER_ADDRESS",
                "A valid customer address is required.",
                400,
            )

        service_area_available = await self.repository.is_service_area_available(
            service_context.service_id,
            address.latitude,
            address.longitude,
        )
""",
        """        if address_id is not None:
            address = await self.repository.get_customer_address(
                address_id,
                customer_id,
            )
            if address is None:
                raise AppError(
                    "INVALID_CUSTOMER_ADDRESS",
                    "A valid customer address is required.",
                    400,
                )
            service_latitude = address.latitude
            service_longitude = address.longitude
        elif latitude is not None and longitude is not None:
            service_latitude = latitude
            service_longitude = longitude
        else:
            raise AppError(
                "INVALID_CUSTOMER_ADDRESS",
                "A valid service location is required.",
                400,
            )

        service_area_available = await self.repository.is_service_area_available(
            service_context.service_id,
            service_latitude,
            service_longitude,
        )
""",
        "instant availability address lookup",
    )
    c = replace_once(
        c,
        """                service_context.service_id,
                address.latitude,
                address.longitude,
                cursor,
""",
        """                service_context.service_id,
                service_latitude,
                service_longitude,
                cursor,
""",
        "instant slot worker count coordinates",
    )
    return c

prepare("backend/app/modules/availability/service.py", transform_availability_service)


def transform_availability_api(c: str) -> str:
    return replace_once(
        c,
        """        request.duration_hours,
        UUID(current_user.id),
    )
""",
        """        request.duration_hours,
        UUID(current_user.id),
        latitude=request.latitude,
        longitude=request.longitude,
    )
""",
        "availability route coordinates forwarding",
    )

prepare("backend/app/api/v1/availability.py", transform_availability_api)

# ---------------------------------------------------------------------------
# 10) Only return booking-used locations from the new history endpoint.
#     Keep GET /addresses unchanged for backwards compatibility.
# ---------------------------------------------------------------------------
def transform_address_repository(c: str) -> str:
    anchor = """    async def get_customer_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> CustomerAddressRow | None:
"""
    insertion = '''    async def get_customer_booking_addresses(
        self,
        customer_id: UUID,
    ) -> list[CustomerAddressRow]:
        query = text(
            """
            SELECT
                a.id,
                a.label,
                a.address_line,
                a.latitude,
                a.longitude,
                a.created_at,
                MAX(b.created_at) AS last_booked_at
            FROM public.addresses a
            JOIN public.bookings b
              ON b.address_id = a.id
             AND b.customer_id = a.user_id
            WHERE a.user_id = :customer_id
            GROUP BY
                a.id,
                a.label,
                a.address_line,
                a.latitude,
                a.longitude,
                a.created_at
            ORDER BY MAX(b.created_at) DESC, a.created_at DESC
            """
        )
        result = await self.db.execute(query, {"customer_id": customer_id})
        return [
            CustomerAddressRow(
                id=row["id"],
                label=row["label"],
                address_line=row["address_line"],
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                created_at=row["created_at"],
            )
            for row in result.mappings()
        ]

'''
    return replace_once(c, anchor, insertion + anchor, "booked address repository query insertion")

prepare("backend/app/modules/addresses/repository.py", transform_address_repository)


def transform_address_service(c: str) -> str:
    anchor = """    async def get_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> CustomerAddressResponse | None:
"""
    insertion = '''    async def get_booking_addresses(
        self,
        customer_id: UUID,
    ) -> list[CustomerAddressResponse]:
        try:
            rows = await self.repository.get_customer_booking_addresses(customer_id)
        except Exception as exc:
            raise AppError(
                "ADDRESS_FETCH_FAILED",
                "Unable to fetch previous booking locations.",
                400,
            ) from exc

        return [self._to_response(row) for row in rows]

'''
    return replace_once(c, anchor, insertion + anchor, "booked address service insertion")

prepare("backend/app/modules/addresses/service.py", transform_address_service)


def transform_address_api(c: str) -> str:
    anchor = """@router.get(
    "/{address_id}",
    response_model=CustomerAddressResponse,
)
"""
    insertion = '''@router.get(
    "/booking-locations",
    response_model=list[CustomerAddressResponse],
)
async def get_booking_locations(
    current_user: CurrentUser = Depends(get_customer),
    service: AddressesService = Depends(get_addresses_service),
) -> list[CustomerAddressResponse]:
    return await service.get_booking_addresses(UUID(current_user.id))


'''
    return replace_once(c, anchor, insertion + anchor, "booking locations API route insertion")

prepare("backend/app/api/v1/addresses.py", transform_address_api)

# ---------------------------------------------------------------------------
# 11) Saved Addresses profile view now uses booking history while the general
#     address endpoint and delete implementation remain unchanged.
# ---------------------------------------------------------------------------
def transform_saved_addresses_screen(c: str) -> str:
    c = replace_once(
        c,
        "  getCustomerSavedAddresses,\n",
        "  getCustomerBookingLocations,\n",
        "SavedAddresses screen service import",
    )
    c = replace_once(
        c,
        "await getCustomerSavedAddresses()",
        "await getCustomerBookingLocations()",
        "SavedAddresses screen load function",
    )
    c = replace_once(
        c,
        """              Select a service location
              on Home and KvikStaff will
              save it for future bookings.
""",
        """              Locations used for your previous bookings
              will appear here and can be selected from Home.
""",
        "SavedAddresses empty-state text",
    )
    return c

prepare("customer-app/screens/profile/SavedAddressesScreen.tsx", transform_saved_addresses_screen)

# New regression tests. Stop rather than overwrite existing user work.
new_files: dict[str, str] = {
    "backend/tests/test_booking_location_schemas.py": '''import pytest
from pydantic import ValidationError
from app.modules.bookings.schemas import (
    InstantBookingCreateRequest,
    MultiOccurrenceBookingCreateRequest,
)


def location_payload():
    return {
        "latitude": 28.6139,
        "longitude": 77.2090,
        "address": "Connaught Place, New Delhi",
    }


def test_instant_booking_accepts_inline_location():
    request = InstantBookingCreateRequest.model_validate({
        "service_variant_id": "11111111-1111-4111-8111-111111111111",
        "location": location_payload(),
        "scheduled_start": "2026-10-15T10:00:00+05:30",
        "scheduled_end": "2026-10-15T11:00:00+05:30",
    })
    assert request.address_id is None
    assert request.location is not None
    assert request.location.address == "Connaught Place, New Delhi"


def test_instant_booking_keeps_legacy_address_id_support():
    request = InstantBookingCreateRequest.model_validate({
        "service_variant_id": "11111111-1111-4111-8111-111111111111",
        "address_id": "22222222-2222-4222-8222-222222222222",
        "scheduled_start": "2026-10-15T10:00:00+05:30",
        "scheduled_end": "2026-10-15T11:00:00+05:30",
    })
    assert request.address_id is not None
    assert request.location is None


def test_booking_rejects_missing_location_source():
    with pytest.raises(ValidationError):
        InstantBookingCreateRequest.model_validate({
            "service_variant_id": "11111111-1111-4111-8111-111111111111",
            "scheduled_start": "2026-10-15T10:00:00+05:30",
            "scheduled_end": "2026-10-15T11:00:00+05:30",
        })


def test_booking_rejects_both_location_sources():
    with pytest.raises(ValidationError):
        InstantBookingCreateRequest.model_validate({
            "service_variant_id": "11111111-1111-4111-8111-111111111111",
            "address_id": "22222222-2222-4222-8222-222222222222",
            "location": location_payload(),
            "scheduled_start": "2026-10-15T10:00:00+05:30",
            "scheduled_end": "2026-10-15T11:00:00+05:30",
        })


def test_multi_occurrence_booking_accepts_inline_location():
    request = MultiOccurrenceBookingCreateRequest.model_validate({
        "service_variant_id": "11111111-1111-4111-8111-111111111111",
        "location": location_payload(),
        "schedule_start_date": "2026-10-19",
        "schedule_end_date": "2026-10-19",
        "daily_start_time": "10:00:00",
        "daily_end_time": "11:00:00",
        "selected_weekdays": [1],
        "off_dates": [],
    })
    assert request.address_id is None
    assert request.location is not None
''',
    "backend/tests/test_booking_address_repository.py": '''from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.modules.bookings.repository import BookingsRepository


@pytest.mark.asyncio
async def test_resolve_location_reuses_existing_owned_address():
    session = AsyncMock()
    existing_id = uuid4()
    result = Mock()
    result.scalar_one_or_none.return_value = existing_id
    session.execute.return_value = result
    repository = BookingsRepository(session)

    resolved = await repository._resolve_customer_address_id(
        customer_id=uuid4(),
        address_id=None,
        location={
            "latitude": 28.6139,
            "longitude": 77.2090,
            "address": "Connaught Place, New Delhi",
        },
    )

    assert resolved == (existing_id, False)
    assert session.execute.await_count == 1
    assert "FROM public.addresses" in str(session.execute.await_args.args[0])


@pytest.mark.asyncio
async def test_resolve_location_inserts_new_address_for_booking_transaction():
    session = AsyncMock()
    created_id = uuid4()
    no_match = Mock()
    no_match.scalar_one_or_none.return_value = None
    inserted = Mock()
    inserted.scalar_one.return_value = created_id
    session.execute.side_effect = [no_match, inserted]
    repository = BookingsRepository(session)

    resolved = await repository._resolve_customer_address_id(
        customer_id=uuid4(),
        address_id=None,
        location={
            "latitude": 28.6139,
            "longitude": 77.2090,
            "address": "Connaught Place, New Delhi",
        },
    )

    assert resolved == (created_id, True)
    assert session.execute.await_count == 2
    insert_sql = str(session.execute.await_args_list[1].args[0])
    assert "INSERT INTO public.addresses" in insert_sql
''',
    "customer-app/services/availability/instantSlotAvailability.service.test.ts": '''jest.mock('../../lib/api', () => ({ apiRequest: jest.fn() }))

import { apiRequest } from '../../lib/api'
import { getInstantAvailabilitySlots } from './instantSlotAvailability.service'

const mockedApiRequest = apiRequest as jest.Mock

describe('instantSlotAvailability.service', () => {
  beforeEach(() => mockedApiRequest.mockReset())

  it('checks availability using coordinates without creating an address', async () => {
    mockedApiRequest.mockResolvedValue({
      service_area_available: true,
      instant_available: true,
      slots: [],
    })

    await getInstantAvailabilitySlots(
      'service-variant-1',
      { latitude: 28.6139, longitude: 77.2090 },
      2,
    )

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/availability/instant/slots',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          service_variant_id: 'service-variant-1',
          latitude: 28.6139,
          longitude: 77.2090,
          duration_hours: 2,
        }),
      }),
    )
    expect(mockedApiRequest.mock.calls[0][1].body).not.toContain('address_id')
  })
})
''',
}

for relative in new_files:
    if (ROOT / relative).exists():
        stop(f"New test file already exists: {relative}. Review it before applying this patch.")

# Verify key behavior anchors across the prepared content before writing.
checks = {
    "customer-app/navigation/RootNavigator.tsx": ["getOrCreateCustomerAddress"],
    "customer-app/screens/bookings/BookingScreen.tsx": ["getOrCreateCustomerAddress"],
    "customer-app/navigation/CustomerNavigator.tsx": ["getOrCreateCustomerAddress", "addressId,"],
    "backend/app/modules/bookings/repository.py": ["_resolve_customer_address_id", "INSERT INTO public.addresses"],
    "customer-app/screens/home/HomeScreen.tsx": ["getCustomerBookingLocations", "PREVIOUS BOOKING LOCATIONS", "void fetchCurrentLocation(true)"],
}
for relative, required_absent_or_present in checks.items():
    content = PREPARED[relative]
    if relative in {"customer-app/navigation/RootNavigator.tsx", "customer-app/screens/bookings/BookingScreen.tsx", "customer-app/navigation/CustomerNavigator.tsx"}:
        if "getOrCreateCustomerAddress" in content:
            stop(f"Persistence call remains in a selection/availability path: {relative}")
        if relative.endswith("CustomerNavigator.tsx") and "addressId," in content:
            stop("At least one booking service call still appears to pass addressId.")
    else:
        for required in required_absent_or_present:
            if required not in content:
                stop(f"Expected behavior anchor missing after patch in {relative}: {required}")

# Check all target transformations prepared correctly before write.
for relative, content in PREPARED.items():
    (ROOT / relative).write_text(content, encoding="utf-8")
    print(f"Patched {relative}")
for relative, content in new_files.items():
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"Created {relative}")

print("\nPatch applied on branch:", branch)
print("No production deployment or database migration was run.")
print("Next: run customer-app typecheck/lint/Jest and backend pytest, then inspect git diff before staging.")
