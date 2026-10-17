import { apiRequest } from '../../lib/api'

export type WalletSummary = {
  walletId: string
  balancePaise: number
  currency: string
  status: string
  updatedAt: string
}

export type WalletTransaction = {
  transactionId: string
  transactionType: string
  direction: 'credit' | 'debit'
  amountPaise: number
  balanceAfterPaise: number
  currency: string
  sourceType: string
  sourceId: string | null
  createdAt: string
}

export type WalletTransactionPage = {
  walletId: string
  items: WalletTransaction[]
  total: number
  limit: number
  offset: number
}

export type WalletTopupOrder = {
  success: true
  topupId: string
  walletId: string
  amountPaise: number
  currency: string
  status: string
  keyId?: string
  orderId?: string
  receipt?: string
  alreadyPaid?: boolean
  paymentId?: string
}

export type WalletCheckoutResult = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export type WalletTopupVerification = {
  success: true
  topupId: string
  paymentId: string
  status: string
  balancePaise: number
  idempotent?: boolean
}

export async function getWalletSummary(): Promise<WalletSummary> {
  return apiRequest<WalletSummary>('/wallet', {
    method: 'GET',
  })
}

export async function getWalletTransactions(
  limit = 20,
  offset = 0,
): Promise<WalletTransactionPage> {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    throw new Error('Invalid wallet history pagination.')
  }

  return apiRequest<WalletTransactionPage>(
    `/wallet/transactions?limit=${limit}&offset=${offset}`,
    { method: 'GET' },
  )
}

export async function createWalletTopupOrder(
  amountPaise: number,
  idempotencyKey: string,
): Promise<WalletTopupOrder> {
  if (
    !Number.isInteger(amountPaise) ||
    amountPaise < 10000 ||
    amountPaise > 5000000
  ) {
    throw new Error(
      'Wallet top-ups must be between ₹100 and ₹50,000.',
    )
  }

  if (!idempotencyKey.trim()) {
    throw new Error('A wallet top-up request key is required.')
  }

  return apiRequest<WalletTopupOrder>(
    '/wallet/topups/order',
    {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify({
        amount_paise: amountPaise,
      }),
    },
  )
}

export async function verifyWalletTopupPayment(
  topupId: string,
  checkout: WalletCheckoutResult,
): Promise<WalletTopupVerification> {
  if (
    !topupId ||
    !checkout.razorpay_order_id ||
    !checkout.razorpay_payment_id ||
    !checkout.razorpay_signature
  ) {
    throw new Error(
      'Razorpay returned incomplete wallet payment information.',
    )
  }

  return apiRequest<WalletTopupVerification>(
    '/wallet/topups/verify',
    {
      method: 'POST',
      body: JSON.stringify({
        topup_id: topupId,
        razorpay_order_id: checkout.razorpay_order_id,
        razorpay_payment_id: checkout.razorpay_payment_id,
        razorpay_signature: checkout.razorpay_signature,
      }),
    },
  )
}