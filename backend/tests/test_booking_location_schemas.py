import pytest
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
