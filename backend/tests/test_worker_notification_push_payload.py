import pytest
import os
import re

# Regression test to verify the push trigger payload logic structure
# without relying strictly on the raw string match in simple terms.
# Given the setup, we can't spin up a full pg_prove test instance here,
# so we parse the SQL structure to ensure jsonb_build_object
# maps 'booking_worker_offer_id' correctly.

def test_push_trigger_includes_offer_id():
    with open('../supabase/migrations/20261015000000_fix_worker_notification_push_payload.sql', 'r') as f:
        sql_content = f.read()

    # We want to verify that in the jsonb_build_object call inside the trigger,
    # the key 'booking_worker_offer_id' maps to NEW.booking_worker_offer_id.

    # Simple regex to check if they appear close to each other in the correct order
    pattern = r"'booking_worker_offer_id',\s*NEW\.booking_worker_offer_id"
    match = re.search(pattern, sql_content, re.IGNORECASE)

    assert match is not None, "The booking_worker_offer_id was not found mapped to NEW.booking_worker_offer_id in the payload."
