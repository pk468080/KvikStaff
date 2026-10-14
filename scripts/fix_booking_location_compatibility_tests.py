#!/usr/bin/env python3
"""Fix optional location parameter compatibility and update atomic idempotency mocks."""
from pathlib import Path
import subprocess

ROOT = Path.cwd()
if not (ROOT / ".git").exists():
    raise SystemExit("STOP: Run from the KvikStaff repository root (folder containing .git).")
branch = subprocess.run(
    ["git", "branch", "--show-current"], cwd=ROOT, text=True,
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
).stdout.strip()
if branch != "feat/customer-booking-location-history":
    raise SystemExit(f"STOP: Expected feat/customer-booking-location-history, found {branch!r}. No files changed.")

repo_path = ROOT / "backend/app/modules/bookings/repository.py"
test_path = ROOT / "backend/tests/test_atomic_idempotency.py"
repo = repo_path.read_text(encoding="utf-8")
tests = test_path.read_text(encoding="utf-8")

old_hourly = '''    async def create_hourly_booking(
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
    ) -> dict[str, Any]:'''
new_hourly = '''    async def create_hourly_booking(
        self,
        customer_id: UUID,
        service_variant_id: UUID,
        address_id: UUID | None,
        booking_type: str,
        scheduled_start: datetime,
        scheduled_end: datetime,
        notes: str | None,
        idempotency_key: str,
        request_hash: str,
        location: dict[str, Any] | None = None,
    ) -> dict[str, Any]:'''
old_multi = '''    async def create_multi_occurrence_booking(
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
    ) -> dict[str, Any]:'''
new_multi = '''    async def create_multi_occurrence_booking(
        self,
        customer_id: UUID,
        service_variant_id: UUID,
        address_id: UUID | None,
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
        location: dict[str, Any] | None = None,
    ) -> dict[str, Any]:'''
if repo.count(old_hourly) != 1 or repo.count(old_multi) != 1:
    raise SystemExit("STOP: Repository signatures did not match exactly. No files changed.")

old_mock = '''    def scalar_one(self):
        if self.row is None:
            raise RuntimeError("Unable to complete")
        return self.row
    def mappings(self):'''
new_mock = '''    def scalar_one(self):
        if self.row is None:
            raise RuntimeError("Unable to complete")
        return self.row
    def scalar_one_or_none(self):
        return self.row
    def mappings(self):'''
if tests.count(old_mock) != 1:
    raise SystemExit("STOP: MockResult scalar_one anchor did not match exactly once. No files changed.")
old_side_effect = '''        MockResult(None), # auth context
        MockResult({"id": 1}), # insert idempotency (claim_or_replay acquire)
        MockResult('{"id": "123e4567-e89b-12d3-a456-426614174000"}'), # scalar_one for booking
        MockResult({"id": 1}), # complete_idempotency update
    ])'''
new_side_effect = '''        MockResult(None), # auth context
        MockResult({"id": 1}), # insert idempotency (claim_or_replay acquire)
        MockResult(uuid.uuid4()), # customer-owned address lookup
        MockResult('{"id": "123e4567-e89b-12d3-a456-426614174000"}'), # scalar_one for booking
        MockResult({"id": 1}), # complete_idempotency update
    ])'''
if tests.count(old_side_effect) != 1:
    raise SystemExit("STOP: Atomic-idempotency first-request mock anchor did not match exactly once. No files changed.")
old_count = '''    assert result == {"id": "123e4567-e89b-12d3-a456-426614174000"}
    assert fake_db.execute.call_count == 4'''
new_count = '''    assert result == {"id": "123e4567-e89b-12d3-a456-426614174000"}
    assert fake_db.execute.call_count == 5'''
if tests.count(old_count) != 1:
    raise SystemExit("STOP: Atomic-idempotency expected-call-count anchor did not match exactly once. No files changed.")

# Prepare every edit in memory before writing either file.
repo_updated = repo.replace(old_hourly, new_hourly, 1).replace(old_multi, new_multi, 1)
tests_updated = tests.replace(old_mock, new_mock, 1).replace(old_side_effect, new_side_effect, 1).replace(old_count, new_count, 1)
repo_path.write_text(repo_updated, encoding="utf-8")
test_path.write_text(tests_updated, encoding="utf-8")
print("Patched repository method signatures to keep location optional and compatible with address_id callers.")
print("Updated the atomic-idempotency fake session for the new address ownership lookup.")
print("Run backend pytest from ~/tempstaff/backend; this script does not run tests or deploy anything.")
