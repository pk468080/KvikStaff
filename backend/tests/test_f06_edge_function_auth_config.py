from pathlib import Path
import tomllib


REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = REPO_ROOT / "supabase" / "config.toml"
F06_FUNCTIONS = (
    "razorpay-webhook",
    "process-razorpay-refund",
    "send-worker-push",
    "process-worker-push-receipts",
    "razorpayx-payout-webhook",
    "reconcile-worker-payouts",
    "migrate-customer-phone-identities",
)


def test_f06_functions_have_explicit_handler_auth_gateway_configuration():
    with CONFIG_PATH.open("rb") as config_file:
        config = tomllib.load(config_file)

    functions = config.get("functions", {})
    missing_or_enabled = [
        slug
        for slug in F06_FUNCTIONS
        if functions.get(slug, {}).get("verify_jwt") is not False
    ]

    assert not missing_or_enabled, (
        "F-06 functions must explicitly set verify_jwt = false because they use "
        "handler-level provider signature, server-secret, or admin checks. "
        f"Missing or incorrect config for: {', '.join(missing_or_enabled)}"
    )
