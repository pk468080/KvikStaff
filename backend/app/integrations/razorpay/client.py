from typing import Any

import httpx


class RazorpayApiError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class RazorpayClient:
    BASE_URL = "https://api.razorpay.com/v1"

    def __init__(
        self,
        key_id: str,
        key_secret: str,
    ) -> None:
        self.key_id = key_id
        self.key_secret = key_secret

    async def create_order(
        self,
        amount_paise: int,
        currency: str,
        receipt: str,
        notes: dict[str, str],
    ) -> dict[str, Any]:
        payload = {
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt,
            "notes": notes,
        }

        try:
            async with httpx.AsyncClient(
                timeout=15.0,
            ) as client:
                response = await client.post(
                    f"{self.BASE_URL}/orders",
                    auth=(
                        self.key_id,
                        self.key_secret,
                    ),
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise RazorpayApiError(
                "Unable to reach Razorpay.",
            ) from exc

        data = self._parse_response(response)

        if not response.is_success:
            raise RazorpayApiError(
                self._provider_message(
                    data,
                    "Unable to create Razorpay order.",
                ),
                response.status_code,
            )

        if not isinstance(data, dict):
            raise RazorpayApiError(
                "Razorpay returned an invalid order response."
            )

        order_id = data.get("id")
        amount = data.get("amount")
        response_currency = data.get("currency")

        if (
            not isinstance(order_id, str)
            or not order_id
            or not isinstance(amount, int)
            or not isinstance(response_currency, str)
        ):
            raise RazorpayApiError(
                "Razorpay returned an invalid order."
            )

        return data

    async def list_order_payments(
        self,
        order_id: str,
    ) -> list[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(
                timeout=15.0,
            ) as client:
                response = await client.get(
                    f"{self.BASE_URL}/orders/"
                    f"{order_id}/payments",
                    auth=(
                        self.key_id,
                        self.key_secret,
                    ),
                )
        except httpx.HTTPError as exc:
            raise RazorpayApiError(
                "Unable to reach Razorpay.",
            ) from exc

        data = self._parse_response(response)

        if not response.is_success:
            raise RazorpayApiError(
                self._provider_message(
                    data,
                    "Unable to verify the Razorpay order.",
                ),
                response.status_code,
            )

        if (
            not isinstance(data, dict)
            or not isinstance(
                data.get("items"),
                list,
            )
        ):
            raise RazorpayApiError(
                "Razorpay returned an invalid order payments response."
            )

        return [
            item
            for item in data["items"]
            if isinstance(item, dict)
        ]

    async def get_payment(
        self,
        payment_id: str,
    ) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                timeout=15.0,
            ) as client:
                response = await client.get(
                    f"{self.BASE_URL}/payments/"
                    f"{payment_id}",
                    auth=(
                        self.key_id,
                        self.key_secret,
                    ),
                )
        except httpx.HTTPError as exc:
            raise RazorpayApiError(
                "Unable to reach Razorpay.",
            ) from exc

        data = self._parse_response(response)

        if not response.is_success:
            raise RazorpayApiError(
                self._provider_message(
                    data,
                    "Unable to verify Razorpay payment.",
                ),
                response.status_code,
            )

        if not isinstance(data, dict):
            raise RazorpayApiError(
                "Razorpay returned an invalid payment response."
            )

        return data

    @staticmethod
    def _parse_response(
        response: httpx.Response,
    ) -> Any:
        try:
            return response.json()
        except ValueError:
            return None

    @staticmethod
    def _provider_message(
        data: Any,
        fallback: str,
    ) -> str:
        if isinstance(data, dict):
            error = data.get("error")

            if isinstance(error, dict):
                description = error.get(
                    "description"
                )

                if (
                    isinstance(description, str)
                    and description.strip()
                ):
                    return description

                reason = error.get("reason")

                if (
                    isinstance(reason, str)
                    and reason.strip()
                ):
                    return reason

        return fallback
    