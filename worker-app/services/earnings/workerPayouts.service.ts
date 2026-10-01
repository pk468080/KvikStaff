import { supabase } from '../../lib/supabase'
import type {
  WorkerPayoutAccount,
  WorkerPayoutOverview,
  WorkerPayoutRecord,
} from '../../types/payouts'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
}

function numberValue(
  value: unknown,
): number {
  const next = Number(value ?? 0)
  return Number.isFinite(next) ? next : 0
}

function stringValue(
  value: unknown,
): string {
  return typeof value === 'string' ? value : ''
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
  return {
    grossEarnings: numberValue(firstValue(source, ['gross_earnings', 'grossEarnings'])),
    platformFees: numberValue(firstValue(source, ['platform_fees', 'platformFees', 'platform_fee'])),
    netEarnings: numberValue(firstValue(source, ['net_earnings', 'netEarnings'])),
    allocatedAmount: numberValue(firstValue(source, ['allocated_amount', 'allocatedAmount', 'allocated_payout_amount'])),
    pendingAmount: numberValue(firstValue(source, ['pending_amount', 'pendingAmount', 'pending_payout_amount'])),
    availableAmount: numberValue(firstValue(source, ['available_amount', 'availableAmount', 'available_earnings'])),
    payoutDisabled: Boolean(firstValue(source, ['payout_disabled', 'payoutDisabled', 'is_payout_disabled'])),
  }
}

function mapAccount(value: unknown): WorkerPayoutAccount {
  const source = record(value)
  return {
    id: stringValue(firstValue(source, ['id', 'account_id'])),
    accountType: stringValue(firstValue(source, ['account_type', 'accountType', 'type'])),
    accountHolderName: stringValue(firstValue(source, ['account_holder_name', 'accountHolderName', 'holder_name'])),
    maskedDetails: stringValue(firstValue(source, ['masked_details', 'maskedDetails', 'account_last4', 'upi_id'])),
    status: stringValue(firstValue(source, ['status', 'account_status'])),
    isDefault: Boolean(firstValue(source, ['is_default', 'isDefault'])),
    isVerified: Boolean(firstValue(source, ['is_verified', 'isVerified'])),
  }
}

function mapPayout(value: unknown): WorkerPayoutRecord {
  const source = record(value)
  return {
    id: stringValue(firstValue(source, ['id', 'payout_id'])),
    amount: numberValue(firstValue(source, ['amount', 'payout_amount'])),
    status: stringValue(firstValue(source, ['status', 'payout_status'])),
    createdAt: stringValue(firstValue(source, ['created_at', 'createdAt'])),
    accountLabel: stringValue(firstValue(source, ['account_label', 'accountLabel', 'payout_account_id'])),
  }
}

async function callRpc(
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await supabase.rpc(name as never, args as never)
  if (error) throw error
  return data
}

export async function getWorkerPayoutOverview(): Promise<WorkerPayoutOverview> {
  return mapOverview(await callRpc('worker_get_payout_overview'))
}

export async function getWorkerAvailableEarnings(): Promise<number> {
  const value = await callRpc('worker_get_available_earnings')
  const source = record(value)
  return numberValue(
    typeof value === 'number'
      ? value
      : firstValue(source, ['available_amount', 'availableAmount', 'amount', 'available_earnings']),
  )
}

export async function listWorkerPayoutAccounts(): Promise<WorkerPayoutAccount[]> {
  const value = await callRpc('worker_list_payout_accounts')
  const rows = Array.isArray(value) ? value : record(value).accounts
  return Array.isArray(rows) ? rows.map(mapAccount) : []
}

export async function listWorkerPayouts(limit = 25): Promise<WorkerPayoutRecord[]> {
  const value = await callRpc('worker_list_payouts', { p_limit: limit })
  const rows = Array.isArray(value) ? value : record(value).payouts
  return Array.isArray(rows) ? rows.map(mapPayout) : []
}

export async function requestWorkerPayout(
  amount: number,
  payoutAccountId: string,
): Promise<unknown> {
  return callRpc('worker_request_payout', {
    p_amount: amount,
    p_payout_account_id: payoutAccountId,
  })
}

export async function setWorkerDefaultPayoutAccount(
  accountId: string,
): Promise<unknown> {
  return callRpc('worker_set_default_payout_account', {
    p_account_id: accountId,
  })
}

export async function disableWorkerPayoutAccount(
  accountId: string,
): Promise<unknown> {
  return callRpc('worker_disable_payout_account', {
    p_account_id: accountId,
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
