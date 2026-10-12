from __future__ import annotations

import logging
import math
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.core.geocoding_rate_limit import (
    enforce_geocoding_rate_limit,
)
from app.core.security import CurrentUser, get_customer

logger = logging.getLogger(__name__)

router = APIRouter()

GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"

PROVIDER_ERROR_MESSAGE = (
    "Address search is temporarily unavailable. " "Please try again shortly."
)


class GeocodeAddressRequest(BaseModel):
    address: str = Field(min_length=3, max_length=256)

    @field_validator("address", mode="before")
    @classmethod
    def normalize_address(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("Enter a valid service address.")  # noqa: TRY004

        normalized = value.strip()

        if len(normalized) < 3:
            raise ValueError(
                "Enter a more specific service address, area, or PIN code."
            )

        return normalized


class GeocodeAddressResponse(BaseModel):
    latitude: float
    longitude: float
    formatted_address: str


def _parse_google_geocoding_payload(
    payload: object,
) -> GeocodeAddressResponse:
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail=PROVIDER_ERROR_MESSAGE,
        )

    provider_status = payload.get("status")

    if provider_status == "ZERO_RESULTS":
        raise HTTPException(
            status_code=404,
            detail=(
                "No matching address was found. Try a full address, "
                "landmark, area, or PIN code."
            ),
        )

    if provider_status != "OK":
        # Do not expose Google's raw diagnostic response to the client.
        logger.warning(
            "Google Geocoding API returned status %s.",
            (provider_status if isinstance(provider_status, str) else "unknown"),
        )
        raise HTTPException(
            status_code=503,
            detail=PROVIDER_ERROR_MESSAGE,
        )

    results = payload.get("results")

    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        raise HTTPException(
            status_code=502,
            detail=PROVIDER_ERROR_MESSAGE,
        )

    result = results[0]
    geometry = result.get("geometry")

    coordinates = geometry.get("location") if isinstance(geometry, dict) else None

    formatted_address = result.get("formatted_address")

    if not isinstance(coordinates, dict) or not isinstance(formatted_address, str):
        raise HTTPException(
            status_code=502,
            detail=PROVIDER_ERROR_MESSAGE,
        )

    latitude = coordinates.get("lat")
    longitude = coordinates.get("lng")

    if (
        isinstance(latitude, bool)
        or not isinstance(latitude, (int, float))
        or isinstance(longitude, bool)
        or not isinstance(longitude, (int, float))
        or not math.isfinite(float(latitude))
        or not math.isfinite(float(longitude))
        or not -90 <= float(latitude) <= 90
        or not -180 <= float(longitude) <= 180
        or not formatted_address.strip()
    ):
        raise HTTPException(
            status_code=502,
            detail=PROVIDER_ERROR_MESSAGE,
        )

    return GeocodeAddressResponse(
        latitude=float(latitude),
        longitude=float(longitude),
        formatted_address=formatted_address.strip(),
    )


@router.post(
    "/geocode",
    response_model=GeocodeAddressResponse,
)
async def geocode_customer_address(
    request: GeocodeAddressRequest,
    current_user: Annotated[CurrentUser, Depends(get_customer)],
) -> GeocodeAddressResponse:
    api_key = (settings.google_maps_geocoding_api_key or "").strip()

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=("Address search is not configured yet. " "Please try again later."),
        )

    await enforce_geocoding_rate_limit(
        customer_id=current_user.id,
    )

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(8.0, connect=3.0),
        ) as client:
            response = await client.get(
                GOOGLE_GEOCODING_URL,
                params={
                    "address": request.address,
                    "region": "in",
                    "key": api_key,
                },
            )

            response.raise_for_status()
            payload = response.json()

    except (httpx.HTTPError, ValueError) as exc:
        # Avoid logging exception text because a request URL can
        # contain the server-side API key.
        logger.warning(
            "Google Geocoding API request failed (%s).",
            type(exc).__name__,
        )

        raise HTTPException(
            status_code=503,
            detail=PROVIDER_ERROR_MESSAGE,
        ) from exc

    return _parse_google_geocoding_payload(payload)
