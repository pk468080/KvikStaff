#!/usr/bin/env python3
"""Safely add explicit UUID casts to the review-submission duplicate check."""
from pathlib import Path

path = Path("backend/app/modules/reviews/repository.py")
if not path.is_file():
    raise SystemExit(f"STOP: Run this script from the repository root; missing {path}")

source = path.read_text(encoding="utf-8")
old_null = "(:occurrence_id IS NULL AND occurrence_id IS NULL)"
new_null = "(CAST(:occurrence_id AS uuid) IS NULL AND occurrence_id IS NULL)"
old_eq = "OR occurrence_id = :occurrence_id"
new_eq = "OR occurrence_id = CAST(:occurrence_id AS uuid)"

# The GET lookup was already fixed in the previous patch. Exactly one old pair
# should remain in submit_customer_booking_review's existing-review check.
if source.count(old_null) != 1 or source.count(old_eq) != 1:
    raise SystemExit(
        "STOP: Expected exactly one untyped nullable-occurrence predicate and one matching comparison. "
        "No files were changed; inspect repository.py before retrying."
    )

updated = source.replace(old_null, new_null, 1).replace(old_eq, new_eq, 1)
if updated == source:
    raise SystemExit("STOP: The expected SQL was not changed.")

path.write_text(updated, encoding="utf-8")
print(f"Patched {path}: explicitly typed occurrence_id as UUID in the submit-review duplicate check.")
print("No database migrations or deployments were run.")
