from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.api.v1 import locations
from app.core import geocoding_rate_limit as rate_limiter
from app.core.security import CurrentUser
from app.main import app

TEST_CUSTOMER_ID = "11111111-1111-1111-1111-111111111111"
TEST_API_KEY = "test-google-api-key"

VALID_GOOGLE_PAYLOAD = {
    "status": "OK",
    "results": [
        {
            "formatted_address": "New Delhi, Delhi, India",
            "geometry": {
                "location": {
                    "lat": 28.6139,
                    "lng": 77.2090,
                }
            },
        }
    ],
}


@pytest.fixture
def customer_client():
    dependency = locations.get_customer
    had_override = dependency in app.dependency_overrides
    previous_override = app.dependency_overrides.get(dependency)

    app.dependency_overrides[dependency] = lambda: CurrentUser(
        id=TEST_CUSTOMER_ID,
        role="customer",
        email=None,
    )

    try:
        yield TestClient(app)
    finally:
        if had_override:
            app.dependency_overrides[dependency] = previous_override
        else:
            app.dependency_overrides.pop(dependency, None)


def install_google_response(monkeypatch, payload, error=None):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            if error is not None:
                raise error

        def json(self):
            return payload

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            calls.append({"client_kwargs": kwargs})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, *, params):
            calls.append(
                {
                    "url": url,
                    "params": params,
                }
            )
            return FakeResponse()

    monkeypatch.setattr(
        locations.httpx,
        "AsyncClient",
        FakeAsyncClient,
    )
    return calls


def configure_geocoding(monkeypatch):
    monkeypatch.setattr(
        locations.settings,
        "google_maps_geocoding_api_key",
        TEST_API_KEY,
    )
    limiter = AsyncMock()
    monkeypatch.setattr(
        locations,
        "enforce_geocoding_rate_limit",
        limiter,
    )
    return limiter


def test_geocode_address_success(customer_client, monkeypatch):
    limiter = configure_geocoding(monkeypatch)
    calls = install_google_response(
        monkeypatch,
        VALID_GOOGLE_PAYLOAD,
    )

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "  New Delhi  "},
    )

    assert response.status_code == 200
    assert response.json() == {
        "latitude": 28.6139,
        "longitude": 77.2090,
        "formatted_address": "New Delhi, Delhi, India",
    }

    limiter.assert_awaited_once_with(
        customer_id=TEST_CUSTOMER_ID,
    )
    assert calls[1]["url"] == locations.GOOGLE_GEOCODING_URL
    assert calls[1]["params"] == {
        "address": "New Delhi",
        "region": "in",
        "key": TEST_API_KEY,
    }


def test_geocode_rejects_missing_api_key(
    customer_client,
    monkeypatch,
):
    monkeypatch.setattr(
        locations.settings,
        "google_maps_geocoding_api_key",
        None,
    )
    limiter = AsyncMock()
    monkeypatch.setattr(
        locations,
        "enforce_geocoding_rate_limit",
        limiter,
    )

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "New Delhi"},
    )

    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]
    limiter.assert_not_awaited()


def test_geocode_requires_authentication(monkeypatch):
    monkeypatch.setattr(
        locations.settings,
        "google_maps_geocoding_api_key",
        TEST_API_KEY,
    )

    response = TestClient(app).post(
        "/api/v1/locations/geocode",
        json={"address": "New Delhi"},
    )

    assert response.status_code == 401


def test_geocode_rejects_short_address(
    customer_client,
    monkeypatch,
):
    limiter = configure_geocoding(monkeypatch)

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "  "},
    )

    assert response.status_code == 422
    limiter.assert_not_awaited()


def test_geocode_handles_zero_results(
    customer_client,
    monkeypatch,
):
    configure_geocoding(monkeypatch)
    install_google_response(
        monkeypatch,
        {"status": "ZERO_RESULTS", "results": []},
    )

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "Unknown Place"},
    )

    assert response.status_code == 404
    assert "No matching address" in response.json()["detail"]


def test_geocode_hides_provider_error_details(
    customer_client,
    monkeypatch,
):
    configure_geocoding(monkeypatch)
    install_google_response(
        monkeypatch,
        {
            "status": "REQUEST_DENIED",
            "error_message": "Sensitive provider diagnostic",
        },
    )

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "New Delhi"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == locations.PROVIDER_ERROR_MESSAGE
    assert "Sensitive provider diagnostic" not in response.text


def test_geocode_rejects_invalid_coordinates(
    customer_client,
    monkeypatch,
):
    configure_geocoding(monkeypatch)
    install_google_response(
        monkeypatch,
        {
            "status": "OK",
            "results": [
                {
                    "formatted_address": "Invalid Place",
                    "geometry": {
                        "location": {
                            "lat": 999,
                            "lng": 77.2090,
                        }
                    },
                }
            ],
        },
    )

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "New Delhi"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == locations.PROVIDER_ERROR_MESSAGE


def test_geocode_handles_upstream_http_error(
    customer_client,
    monkeypatch,
):
    configure_geocoding(monkeypatch)

    request = httpx.Request(
        "GET",
        locations.GOOGLE_GEOCODING_URL,
    )
    upstream_response = httpx.Response(
        500,
        request=request,
    )
    upstream_error = httpx.HTTPStatusError(
        "Upstream request failed",
        request=request,
        response=upstream_response,
    )

    install_google_response(
        monkeypatch,
        {},
        error=upstream_error,
    )

    response = customer_client.post(
        "/api/v1/locations/geocode",
        json={"address": "New Delhi"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == locations.PROVIDER_ERROR_MESSAGE


class FakeRedis:
    def __init__(self, result=1, error=None):
        self.result = result
        self.error = error
        self.calls = []

    async def eval(self, *args):
        self.calls.append(args)

        if self.error is not None:
            raise self.error

        return self.result


async def test_geocoding_rate_limiter_allows_request(monkeypatch):
    fake_redis = FakeRedis(result=1)

    monkeypatch.setattr(
        rate_limiter,
        "get_redis_client",
        lambda: fake_redis,
    )

    await rate_limiter.enforce_geocoding_rate_limit(
        customer_id=TEST_CUSTOMER_ID,
    )

    assert len(fake_redis.calls) == 1
    assert fake_redis.calls[0][2] == (
        f"kvikstaff:rate:geocoding:customer:{TEST_CUSTOMER_ID}"
    )


async def test_geocoding_rate_limiter_rejects_excess_requests(
    monkeypatch,
):
    fake_redis = FakeRedis(result=0)

    monkeypatch.setattr(
        rate_limiter,
        "get_redis_client",
        lambda: fake_redis,
    )

    with pytest.raises(HTTPException) as exc_info:
        await rate_limiter.enforce_geocoding_rate_limit(
            customer_id=TEST_CUSTOMER_ID,
        )

    assert exc_info.value.status_code == 429


async def test_geocoding_rate_limiter_fails_closed_in_production(
    monkeypatch,
):
    fake_redis = FakeRedis(
        error=RedisError("Redis unavailable"),
    )

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

    with pytest.raises(HTTPException) as exc_info:
        await rate_limiter.enforce_geocoding_rate_limit(
            customer_id=TEST_CUSTOMER_ID,
        )

    assert exc_info.value.status_code == 503


async def test_geocoding_rate_limiter_allows_local_redis_failure(
    monkeypatch,
):
    fake_redis = FakeRedis(
        error=RedisError("Redis unavailable"),
    )

    monkeypatch.setattr(
        rate_limiter,
        "get_redis_client",
        lambda: fake_redis,
    )
    monkeypatch.setattr(
        rate_limiter.settings,
        "environment",
        "test",
    )

    await rate_limiter.enforce_geocoding_rate_limit(
        customer_id=TEST_CUSTOMER_ID,
    )
