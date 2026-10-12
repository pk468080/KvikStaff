import { supabase } from '../../lib/supabase'

import type {
  WorkerEarning,
  WorkerEarningPeriod,
  WorkerEarningSummary,
} from '../../types/earnings'

type WorkerEarningRow = {
  id: string
  worker_id: string
  booking_id: string
  gross_amount: number
  platform_fee: number
  net_amount: number
  created_at: string
}

const EARNING_SELECT = `
  id,
  worker_id,
  booking_id,
  gross_amount,
  platform_fee,
  net_amount,
  created_at
`

function mapWorkerEarning(
  row: WorkerEarningRow,
): WorkerEarning {
  return {
    id:
      row.id,

    workerId:
      row.worker_id,

    bookingId:
      row.booking_id,

    grossAmount:
      Number(
        row.gross_amount,
      ),

    platformFee:
      Number(
        row.platform_fee,
      ),

    netAmount:
      Number(
        row.net_amount,
      ),

    createdAt:
      row.created_at,
  }
}

function buildSummary(
  earnings: WorkerEarning[],
): WorkerEarningSummary {
  return earnings.reduce<WorkerEarningSummary>(
    (summary, earning) => ({
      totalGrossAmount:
        summary.totalGrossAmount +
        earning.grossAmount,

      totalPlatformFee:
        summary.totalPlatformFee +
        earning.platformFee,

      totalNetAmount:
        summary.totalNetAmount +
        earning.netAmount,

      earningCount:
        summary.earningCount + 1,
    }),
    {
      totalGrossAmount: 0,
      totalPlatformFee: 0,
      totalNetAmount: 0,
      earningCount: 0,
    },
  )
}

async function getCurrentWorkerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A worker authentication session is required.',
    )
  }

  return user.id
}

function validateLimit(
  limit: number,
): number {
  if (
    !Number.isFinite(limit) ||
    !Number.isInteger(limit)
  ) {
    throw new Error(
      'Earning limit must be a whole number.',
    )
  }

  return Math.max(
    1,
    Math.min(
      limit,
      200,
    ),
  )
}

function validateDateRange(
  startDate: string,
  endDate: string,
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      startDate,
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      endDate,
    )
  ) {
    throw new Error(
      'Earning dates must use YYYY-MM-DD format.',
    )
  }

  if (startDate > endDate) {
    throw new Error(
      'Earning start date must be before or equal to the end date.',
    )
  }
}

async function fetchWorkerEarnings(
  workerId: string,
  limit?: number,
): Promise<WorkerEarning[]> {
  let query = supabase
    .from('worker_earnings')
    .select(
      EARNING_SELECT,
    )
    .eq(
      'worker_id',
      workerId,
    )
    .order('created_at', {
      ascending: false,
    })

  if (
    limit !== undefined
  ) {
    query = query.limit(
      validateLimit(limit),
    )
  }

  const {
    data,
    error,
  } = await query

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerEarning(
        row as WorkerEarningRow,
      ),
  )
}

export async function getWorkerEarnings(
  limit = 50,
): Promise<WorkerEarning[]> {
  const workerId =
    await getCurrentWorkerId()

  return fetchWorkerEarnings(
    workerId,
    limit,
  )
}

export async function getWorkerEarning(
  earningId: string,
): Promise<WorkerEarning | null> {
  if (!earningId.trim()) {
    throw new Error(
      'Earning id is required.',
    )
  }

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('worker_earnings')
    .select(
      EARNING_SELECT,
    )
    .eq(
      'id',
      earningId,
    )
    .eq(
      'worker_id',
      workerId,
    )
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapWorkerEarning(
        data as WorkerEarningRow,
      )
    : null
}

export async function getWorkerEarningForBooking(
  bookingId: string,
): Promise<WorkerEarning | null> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking id is required.',
    )
  }

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('worker_earnings')
    .select(
      EARNING_SELECT,
    )
    .eq(
      'booking_id',
      bookingId,
    )
    .eq(
      'worker_id',
      workerId,
    )
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapWorkerEarning(
        data as WorkerEarningRow,
      )
    : null
}

export async function getWorkerEarningsSummary(): Promise<
  WorkerEarningSummary
> {
  const workerId = await getCurrentWorkerId()

  const { data: aggregateData, error: aggregateError } =
    await supabase.rpc(
      'worker_get_available_earnings' as never,
    )

  if (aggregateError) {
    throw aggregateError
  }

  const { count, error: countError } = await supabase
    .from('worker_earnings')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('worker_id', workerId)

  if (countError) {
    throw countError
  }

  const aggregateValue = Array.isArray(aggregateData)
    ? aggregateData[0]
    : aggregateData

  const aggregate =
    aggregateValue &&
    typeof aggregateValue === 'object'
      ? aggregateValue as Record<string, unknown>
      : {}

  function readNumber(value: unknown): number {
    const parsed = Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return {
    totalGrossAmount: readNumber(
      aggregate.gross_earnings,
    ),

    totalPlatformFee: readNumber(
      aggregate.platform_fees,
    ),

    totalNetAmount: readNumber(
      aggregate.net_earnings,
    ),

    earningCount: count ?? 0,
  }
}

export async function getWorkerEarningsForPeriod(
  startDate: string,
  endDate: string,
): Promise<WorkerEarningPeriod> {
  validateDateRange(
    startDate,
    endDate,
  )

  const workerId =
    await getCurrentWorkerId()

  const startIso =
    new Date(
      `${startDate}T00:00:00.000Z`,
    ).toISOString()

  const endExclusiveIso =
    new Date(
      `${endDate}T00:00:00.000Z`,
    )

  endExclusiveIso.setUTCDate(
    endExclusiveIso.getUTCDate() + 1,
  )

    const pageSize = 500
  const earnings: WorkerEarning[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('worker_earnings')
      .select(EARNING_SELECT)
      .eq('worker_id', workerId)
      .gte('created_at', startIso)
      .lt(
        'created_at',
        endExclusiveIso.toISOString(),
      )
      .order('created_at', {
        ascending: false,
      })
      .order('id', {
        ascending: true,
      })
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw error
    }

    const page = (data ?? []).map(
      row => mapWorkerEarning(row as WorkerEarningRow),
    )

    earnings.push(...page)

    if (page.length < pageSize) {
      break
    }
  }

  return {
    startDate,
    endDate,
    summary:
      buildSummary(
        earnings,
      ),
    earnings,
  }
}

export async function getWorkerEarningsForDate(
  date: string,
): Promise<WorkerEarningPeriod> {
  return getWorkerEarningsForPeriod(
    date,
    date,
  )
}

export async function getWorkerEarningsSince(
  startDate: string,
): Promise<WorkerEarningPeriod> {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10)

  return getWorkerEarningsForPeriod(
    startDate,
    today,
  )
}

export function calculateWorkerEarningSummary(
  earnings: WorkerEarning[],
): WorkerEarningSummary {
  return buildSummary(
    earnings,
  )
}

export function formatWorkerEarningAmount(
  amount: number,
): string {
  if (!Number.isFinite(amount)) {
    return '—'
  }

  return amount.toFixed(2)
}

export function getWorkerEarningNetPercentage(
  earning: WorkerEarning,
): number {
  if (
    earning.grossAmount <= 0
  ) {
    return 0
  }

  return (
    earning.netAmount /
    earning.grossAmount
  ) * 100
}