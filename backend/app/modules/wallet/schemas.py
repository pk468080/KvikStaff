from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class WalletSummaryResponse(BaseModel):
    walletId: UUID
    balancePaise: int = Field(ge=0)
    currency: str
    status: str
    updatedAt: datetime


class WalletTransactionResponse(BaseModel):
    transactionId: UUID
    transactionType: str
    direction: str
    amountPaise: int = Field(gt=0)
    balanceAfterPaise: int = Field(ge=0)
    currency: str
    sourceType: str
    sourceId: UUID | None
    createdAt: datetime


class WalletTransactionPageResponse(BaseModel):
    walletId: UUID
    items: list[WalletTransactionResponse]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)