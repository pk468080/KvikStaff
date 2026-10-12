
import * as Crypto from 'expo-crypto'
import { supabase } from '../../lib/supabase'
import type {
  WorkerPayoutAccount,
  WorkerPayoutOverview,
  WorkerPayoutRecord,
} from '../../types/payouts'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

function firstValue(
  source: Record<string, unknown>,
  keys: string[],
): unknown {
  return keys
    .map(key => source[key])
    .find(value => value !== undefined && value !== null)
}

function mapOverview(value: unknown): WorkerPayoutOverview {
  const source = record(value)

  const netEarnings = numberValue(
    firstValue(source, [
      'net_earnings',
      'netEarnings',
      'total_earned',
    ]),
  )

  const platformFees = numberValue(
    firstValue(source, [
      'platform_fees',
      'platformFees',
      'platform_fee',
    ]),
  )

  const grossValue = firstValue(source, [
    'gross_earnings',
    'grossEarnings',
    'gross_amount',
  ])

  const payoutEnabled = source.payout_enabled
  const explicitPayoutDisabled = firstValue(source, [
    'payout_disabled',
    'payoutDisabled',
    'is_payout_disabled',
  ])

  return {
    grossEarnings:
      grossValue === undefined
        ? netEarnings + platformFees
        : numberValue(grossValue),

    platformFees,
    netEarnings,

    allocatedAmount: numberValue(
      firstValue(source, [
        'reserved_for_payout',
        'allocated_amount',
        'allocatedAmount',
        'allocated_payout_amount',
      ]),
    ),

    paidOutAmount: numberValue(
      firstValue(source, [
        'paid_out',
        'paid_out_amount',
        'paidOutAmount',
      ]),
    ),

    availableAmount: numberValue(
      firstValue(source, [
        'available_for_payout',
        'available_amount',
        'availableAmount',
        'available_earnings',
      ]),
    ),

    payoutDisabled:
      payoutEnabled === false ||
      (typeof payoutEnabled === 'string' &&
        payoutEnabled.trim().toLowerCase() === 'false') ||
      booleanValue(explicitPayoutDisabled),
  }
}

function mapAccount(value: unknown): WorkerPayoutAccount {
  const source = record(value)

  const rawAccountType = stringValue(
    firstValue(source, [
      'account_type',
      'accountType',
      'type',
    ]),
  )

  const status = stringValue(
    firstValue(source, [
      'status',
      'account_status',
    ]),
  )

  return {
    id: stringValue(
      firstValue(source, ['id', 'account_id']),
    ),

    accountType:
      rawAccountType.toLowerCase() === 'bank_account'
        ? 'bank'
        : rawAccountType,

    accountHolderName: stringValue(
      firstValue(source, [
        'account_holder_name',
        'accountHolderName',
        'holder_name',
      ]),
    ),

    maskedDetails: stringValue(
      firstValue(source, [
        'masked_details',
        'maskedDetails',
        'account_last4',
        'accountLast4',
        'upi_id_masked',
        'upiIdMasked',
      ]),
    ),

    status,

    isDefault: booleanValue(
      firstValue(source, ['is_default', 'isDefault']),
    ),

    isVerified:
      booleanValue(
        firstValue(source, ['is_verified', 'isVerified']),
      ) || status.toLowerCase() === 'verified',
  }
}

function mapPayout(value: unknown): WorkerPayoutRecord {
  const source = record(value)

  return {
    id: stringValue(
      firstValue(source, ['id', 'payout_id']),
    ),

    amount: numberValue(
      firstValue(source, ['amount', 'payout_amount']),
    ),

    status: stringValue(
      firstValue(source, ['status', 'payout_status']),
    ),

    createdAt: stringValue(
      firstValue(source, ['created_at', 'createdAt']),
    ),

    // Do not display a raw database UUID as an account label.
    accountLabel: stringValue(
      firstValue(source, ['account_label', 'accountLabel']),
    ),
  }
}

async function callRpc(
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await supabase.rpc(
    name as never,
    args as never,
  )

  if (error) throw error
  return data
}

export async function getWorkerPayoutOverview(): Promise<WorkerPayoutOverview> {
  // The first RPC supplies payout lifecycle totals.
  // The second supplies the gross, platform-fee and net totals.
  const [overviewValue, earningsValue] = await Promise.all([
    callRpc('worker_get_payout_overview'),
    callRpc('worker_get_available_earnings'),
  ])

  return mapOverview({
    ...record(earningsValue),
    ...record(overviewValue),
  })
}

export async function getWorkerAvailableEarnings(): Promise<number> {
  const value = await callRpc('worker_get_available_earnings')

  if (typeof value === 'number') {
    return numberValue(value)
  }

  return numberValue(
    firstValue(record(value), [
      'available_amount',
      'available_for_payout',
      'availableAmount',
      'amount',
      'available_earnings',
    ]),
  )
}

export async function listWorkerPayoutAccounts(): Promise<WorkerPayoutAccount[]> {
  const value = await callRpc('worker_list_payout_accounts')
  const rows = Array.isArray(value) ? value : record(value).accounts

  return Array.isArray(rows) ? rows.map(mapAccount) : []
}

export async function listWorkerPayouts(
  limit = 25,
): Promise<WorkerPayoutRecord[]> {
  const safeLimit = Number.isInteger(limit)
    ? Math.max(1, Math.min(limit, 200))
    : 25

  const value = await callRpc('worker_list_payouts', {
    p_limit: safeLimit,
  })

  const rows = Array.isArray(value) ? value : record(value).payouts

  return Array.isArray(rows) ? rows.map(mapPayout) : []
}

let payoutIdempotencyKey: string | null = null
let currentPayoutAmount = 0
let currentPayoutAccountId = ''

export async function requestWorkerPayout(
  amount: number,
  payoutAccountId: string,
): Promise<unknown> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payout amount must be greater than zero.')
  }

  if (!payoutAccountId.trim()) {
    throw new Error('A payout account is required.')
  }

  const normalizedAmount = Math.round(amount * 100) / 100

  if (normalizedAmount <= 0) {
    throw new Error('Payout amount is too small.')
  }

  if (
    !payoutIdempotencyKey ||
    currentPayoutAmount !== normalizedAmount ||
    currentPayoutAccountId !== payoutAccountId
  ) {
    payoutIdempotencyKey = Crypto.randomUUID()
    currentPayoutAmount = normalizedAmount
    currentPayoutAccountId = payoutAccountId
  }

  const result = await callRpc('worker_request_payout', {
    p_amount: normalizedAmount,
    p_payout_account_id: payoutAccountId,
    p_idempotency_key: payoutIdempotencyKey,
  })

  // Keep the same key after a failed request so a retry can be idempotent.
  // A successful request can use a new key next time.
  payoutIdempotencyKey = null

  return result
}

export async function setWorkerDefaultPayoutAccount(
  accountId: string,
): Promise<unknown> {
  if (!accountId.trim()) {
    throw new Error('Payout account id is required.')
  }

  return callRpc('worker_set_default_payout_account', {
    p_payout_account_id: accountId,
  })
}

export async function disableWorkerPayoutAccount(
  accountId: string,
): Promise<unknown> {
  if (!accountId.trim()) {
    throw new Error('Payout account id is required.')
  }

  return callRpc('worker_disable_payout_account', {
    p_payout_account_id: accountId,
  })
}

export async function createWorkerPayoutAccount(
  input: Record<string, string>,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke(
    'create-worker-payout-account',
    { body: input },
  )

  if (error) throw error
  return data
}
