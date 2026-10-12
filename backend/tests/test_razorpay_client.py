"""Tests for the RazorpayClient integration."""

import httpx
import pytest
from unittest.mock import AsyncMock, patch

from app.integrations.razorpay.client import RazorpayClient, RazorpayApiError

@pytest.fixture
def client():
    return RazorpayClient(key_id="test_key_id", key_secret="test_key_secret")

@pytest.mark.asyncio
async def test_create_order_success(client):
    mock_response = httpx.Response(
        200,
        json={"id": "order_123", "amount": 1000, "currency": "INR"}
    )

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response

        result = await client.create_order(
            amount_paise=1000,
            currency="INR",
            receipt="receipt_123",
            notes={"key": "value"}
        )

        assert result == {"id": "order_123", "amount": 1000, "currency": "INR"}
        mock_request.assert_called_once_with(
            "POST",
            "https://api.razorpay.com/v1/orders",
            auth=("test_key_id", "test_key_secret"),
            json={"amount": 1000, "currency": "INR", "receipt": "receipt_123", "notes": {"key": "value"}}
        )

@pytest.mark.asyncio
async def test_create_order_api_error(client):
    mock_response = httpx.Response(
        400,
        json={"error": {"description": "Bad Request"}}
    )

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response

        with pytest.raises(RazorpayApiError) as exc:
            await client.create_order(
                amount_paise=1000,
                currency="INR",
                receipt="receipt_123",
                notes={}
            )

        assert exc.value.message == "Bad Request"
        assert exc.value.status_code == 400

@pytest.mark.asyncio
async def test_create_order_httpx_error(client):
    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        mock_request.side_effect = httpx.RequestError("Network error")

        with pytest.raises(RazorpayApiError) as exc:
            await client.create_order(
                amount_paise=1000,
                currency="INR",
                receipt="receipt_123",
                notes={}
            )

        assert exc.value.message == "Unable to reach Razorpay."

@pytest.mark.asyncio
async def test_create_order_invalid_response(client):
    mock_response = httpx.Response(
        200,
        json={"id": "order_123"} # Missing amount and currency
    )

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response

        with pytest.raises(RazorpayApiError) as exc:
            await client.create_order(
                amount_paise=1000,
                currency="INR",
                receipt="receipt_123",
                notes={}
            )

        assert exc.value.message == "Razorpay returned an invalid order."

@pytest.mark.asyncio
async def test_list_order_payments_success(client):
    mock_response = httpx.Response(
        200,
        json={"items": [{"id": "pay_1"}, {"id": "pay_2"}]}
    )

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response

        result = await client.list_order_payments(order_id="order_123")

        assert result == [{"id": "pay_1"}, {"id": "pay_2"}]
        mock_request.assert_called_once_with(
            "GET",
            "https://api.razorpay.com/v1/orders/order_123/payments",
            auth=("test_key_id", "test_key_secret"),
        )

@pytest.mark.asyncio
async def test_get_payment_success(client):
    mock_response = httpx.Response(
        200,
        json={"id": "pay_123", "amount": 1000, "status": "captured"}
    )

    with patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response

        result = await client.get_payment(payment_id="pay_123")

        assert result == {"id": "pay_123", "amount": 1000, "status": "captured"}
        mock_request.assert_called_once_with(
            "GET",
            "https://api.razorpay.com/v1/payments/pay_123",
            auth=("test_key_id", "test_key_secret"),
        )
