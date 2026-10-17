from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.exceptions import AppError
from app.modules.wallet.service import WalletService


@pytest.fixture
def wallet_context():
    customer_id = uuid4()
    wallet_id = uuid4()

    wallet = {
        "walletId": wallet_id,
        "balancePaise": 0,
        "currency": "INR",
        "status": "active",
        "updatedAt": datetime.now(UTC),
    }

    repository = MagicMock()
    repository.get_or_create_wallet = AsyncMock(
        return_value=wallet,
    )
    repository.list_transactions = AsyncMock(
        return_value={
            "total": 0,
            "items": [],
        },
    )

    return {
        "customer_id": customer_id,
        "wallet_id": wallet_id,
        "wallet": wallet,
        "repository": repository,
        "service": WalletService(repository),
    }


@pytest.mark.asyncio
async def test_get_wallet_summary_returns_customer_wallet(
    wallet_context,
):
    ctx = wallet_context

    result = await ctx["service"].get_wallet_summary(
        ctx["customer_id"],
    )

    assert result == ctx["wallet"]
    assert result["balancePaise"] == 0

    ctx["repository"].get_or_create_wallet.assert_awaited_once_with(
        customer_id=ctx["customer_id"],
    )


@pytest.mark.asyncio
async def test_get_wallet_transactions_returns_empty_history(
    wallet_context,
):
    ctx = wallet_context

    result = await ctx["service"].get_wallet_transactions(
        customer_id=ctx["customer_id"],
        limit=20,
        offset=0,
    )

    assert result["walletId"] == ctx["wallet_id"]
    assert result["items"] == []
    assert result["total"] == 0
    assert result["limit"] == 20
    assert result["offset"] == 0

    ctx["repository"].list_transactions.assert_awaited_once_with(
        wallet_id=ctx["wallet_id"],
        limit=20,
        offset=0,
    )


@pytest.mark.asyncio
async def test_wallet_summary_rejects_unavailable_wallet(
    wallet_context,
):
    ctx = wallet_context
    ctx["repository"].get_or_create_wallet.return_value = None

    with pytest.raises(AppError) as exc:
        await ctx["service"].get_wallet_summary(
            ctx["customer_id"],
        )

    assert exc.value.code == "WALLET_UNAVAILABLE"
    assert exc.value.status_code == 403