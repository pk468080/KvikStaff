import pytest
from unittest.mock import patch, AsyncMock
import httpx

from app.integrations.razorpay.client import RazorpayClient, RazorpayApiError

@pytest.fixture
def razorpay_client():
    return RazorpayClient(key_id="test_key", key_secret="test_secret")

@pytest.mark.asyncio
async def test_create_order_raises_api_error_on_http_error(razorpay_client):
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        mock_client.__aenter__.return_value = mock_client
        mock_client.post = AsyncMock(side_effect=httpx.HTTPError("Network timeout"))

        with pytest.raises(RazorpayApiError) as exc_info:
            await razorpay_client.create_order(
                amount_paise=50000,
                currency="INR",
                receipt="rcpt_1",
                notes={"key": "value"}
            )

        assert exc_info.value.message == "Unable to reach Razorpay."

@pytest.mark.asyncio
async def test_list_order_payments_raises_api_error_on_http_error(razorpay_client):
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        mock_client.__aenter__.return_value = mock_client
        mock_client.get = AsyncMock(side_effect=httpx.HTTPError("Connection failed"))

        with pytest.raises(RazorpayApiError) as exc_info:
            await razorpay_client.list_order_payments("order_123")

        assert exc_info.value.message == "Unable to reach Razorpay."

@pytest.mark.asyncio
async def test_get_payment_raises_api_error_on_http_error(razorpay_client):
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        mock_client.__aenter__.return_value = mock_client
        mock_client.get = AsyncMock(side_effect=httpx.HTTPError("Connection timeout"))

        with pytest.raises(RazorpayApiError) as exc_info:
            await razorpay_client.get_payment("pay_456")

        assert exc_info.value.message == "Unable to reach Razorpay."
