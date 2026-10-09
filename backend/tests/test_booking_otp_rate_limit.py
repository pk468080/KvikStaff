import pytest
from redis.exceptions import RedisError

from app.core import booking_otp_rate_limit as rate_limiter
from app.core.exceptions import AppError


class FakeRedis:
    def __init__(self, result: int = 0, error: Exception | None = None):
        self.result = result
        self.error = error
        self.calls = []

    async def eval(self, *args):
        self.calls.append(args)

        if self.error:
            raise self.error

        return self.result


@pytest.mark.parametrize(
    ("result", "expected_code"),
    [
        (1, "BOOKING_OTP_RATE_LIMITED"),
        (2, "CUSTOMER_OTP_RATE_LIMITED"),
    ],
)
async def test_rate_limiter_rejects_excess_requests(
    monkeypatch,
    result,
    expected_code,
):
    fake_redis = FakeRedis(result=result)

    monkeypatch.setattr(
        rate_limiter,
        "get_redis_client",
        lambda: fake_redis,
    )

    with pytest.raises(AppError) as exc_info:
        await rate_limiter.enforce_booking_otp_rate_limit(
            booking_id="11111111-1111-1111-1111-111111111111",
            customer_id="22222222-2222-2222-2222-222222222222",
            otp_type="start",
        )

    assert exc_info.value.status_code == 429
    assert exc_info.value.code == expected_code
    assert len(fake_redis.calls) == 1


async def test_rate_limiter_allows_requests_under_limits(monkeypatch):
    fake_redis = FakeRedis(result=0)

    monkeypatch.setattr(
        rate_limiter,
        "get_redis_client",
        lambda: fake_redis,
    )

    await rate_limiter.enforce_booking_otp_rate_limit(
        booking_id="11111111-1111-1111-1111-111111111111",
        customer_id="22222222-2222-2222-2222-222222222222",
        otp_type="start",
    )

    assert len(fake_redis.calls) == 1


async def test_production_fails_closed_when_redis_is_unavailable(
    monkeypatch,
):
    fake_redis = FakeRedis(error=RedisError("Redis unavailable"))

    monkeypatch.setattr(
        rate_limiter,
        "get_redis_client",
        lambda: fake_redis,
    )
    monkeypatch.setattr(
        rate_limiter.settings,
        "environment",
        "production",
    )

    with pytest.raises(AppError) as exc_info:
        await rate_limiter.enforce_booking_otp_rate_limit(
            booking_id="11111111-1111-1111-1111-111111111111",
            customer_id="22222222-2222-2222-2222-222222222222",
            otp_type="start",
        )

    assert exc_info.value.status_code == 503
    assert exc_info.value.code == "OTP_RATE_LIMITER_UNAVAILABLE"
