from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class WalletRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create_wallet(
        self,
        customer_id: UUID,
    ) -> dict[str, Any] | None:
        # Create an INR wallet only for an active customer.
        # Concurrent requests cannot create duplicate wallets.
        await self.db.execute(
            text(
                """
                INSERT INTO public.customer_wallets (
                    customer_id,
                    currency
                )
                SELECT
                    p.id,
                    'INR'
                FROM public.profiles AS p
                WHERE p.id = CAST(:customer_id AS uuid)
                  AND p.is_active IS TRUE
                  AND p.role::text = 'customer'
                ON CONFLICT (customer_id, currency)
                DO NOTHING
                """
            ),
            {"customer_id": str(customer_id)},
        )

        await self.db.commit()

        result = await self.db.execute(
            text(
                """
                SELECT
                    w.id AS "walletId",
                    w.balance_paise AS "balancePaise",
                    w.currency,
                    w.status,
                    w.updated_at AS "updatedAt"
                FROM public.customer_wallets AS w
                JOIN public.profiles AS p
                  ON p.id = w.customer_id
                WHERE w.customer_id =
                    CAST(:customer_id AS uuid)
                  AND p.is_active IS TRUE
                  AND p.role::text = 'customer'
                  AND w.currency = 'INR'
                LIMIT 1
                """
            ),
            {"customer_id": str(customer_id)},
        )

        row = result.mappings().first()
        return dict(row) if row is not None else None

    async def list_transactions(
        self,
        wallet_id: UUID,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        count_result = await self.db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM public.wallet_transactions
                WHERE wallet_id = CAST(:wallet_id AS uuid)
                """
            ),
            {"wallet_id": str(wallet_id)},
        )

        total = int(count_result.scalar_one())

        result = await self.db.execute(
            text(
                """
                SELECT
                    id AS "transactionId",
                    transaction_type AS "transactionType",
                    direction,
                    amount_paise AS "amountPaise",
                    balance_after_paise AS "balanceAfterPaise",
                    currency,
                    source_type AS "sourceType",
                    source_id AS "sourceId",
                    created_at AS "createdAt"
                FROM public.wallet_transactions
                WHERE wallet_id = CAST(:wallet_id AS uuid)
                ORDER BY created_at DESC, id DESC
                LIMIT :limit
                OFFSET :offset
                """
            ),
            {
                "wallet_id": str(wallet_id),
                "limit": limit,
                "offset": offset,
            },
        )

        return {
            "total": total,
            "items": [
                dict(row)
                for row in result.mappings().all()
            ],
        }