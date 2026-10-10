from datetime import datetime, timedelta, timezone

import pytest

from app.modules.bookings.service import BookingsService


def occurrence(
    status: str,
    start: datetime,
    worker_id: str | None = None,
) -> dict:
    return {
        "status": status,
        "scheduled_start": start,
        "worker_id": worker_id,
    }


def test_cancelled_upcoming_occurrence_is_skipped():
    now = datetime.now(timezone.utc)

    cancelled = occurrence(
        "cancelled",
        now + timedelta(hours=1),
    )
    upcoming = occurrence(
        "scheduled",
        now + timedelta(hours=2),
    )

    selected = BookingsService.select_preferred_occurrence(
        [cancelled, upcoming]
    )

    assert selected is upcoming


@pytest.mark.parametrize(
    "status",
    ["cancelled", "completed", "expired"],
)
def test_terminal_occurrence_is_not_selected(status):
    now = datetime.now(timezone.utc)

    old_occurrence = occurrence(
        status,
        now - timedelta(hours=1),
    )
    future_occurrence = occurrence(
        status,
        now + timedelta(hours=1),
    )

    selected = BookingsService.select_preferred_occurrence(
        [old_occurrence, future_occurrence]
    )

    assert selected is None


def test_earliest_eligible_upcoming_occurrence_is_selected():
    now = datetime.now(timezone.utc)

    later = occurrence(
        "scheduled",
        now + timedelta(hours=3),
    )
    earlier = occurrence(
        "scheduled",
        now + timedelta(hours=1),
    )

    selected = BookingsService.select_preferred_occurrence(
        [later, earlier]
    )

    assert selected is earlier


def test_active_worker_occurrence_is_preserved():
    now = datetime.now(timezone.utc)

    active = occurrence(
        "in_progress",
        now + timedelta(hours=3),
        worker_id="worker-123",
    )
    upcoming = occurrence(
        "scheduled",
        now + timedelta(hours=1),
    )

    selected = BookingsService.select_preferred_occurrence(
        [upcoming, active]
    )

    assert selected is active
