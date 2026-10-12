import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import type {
  WorkerEarning,
  WorkerEarningPeriod,
  WorkerEarningSummary,
} from '../types/earnings'

import {
  calculateWorkerEarningSummary,
  getWorkerEarning,
  getWorkerEarnings,
  getWorkerEarningsForDate,
  getWorkerEarningsForPeriod,
  getWorkerEarningsSince,
  getWorkerEarningsSummary,
  getWorkerEarningForBooking,
} from '../services/earnings/workerEarnings.service'

export type UseWorkerEarningsResult = {
  earnings: WorkerEarning[]

  summary: WorkerEarningSummary | null

  period: WorkerEarningPeriod | null

  loading: boolean
  error: string | null

  refresh: (
    limit?: number,
  ) => Promise<void>

  refreshSummary: () => Promise<void>

  loadPeriod: (
    startDate: string,
    endDate: string,
  ) => Promise<WorkerEarningPeriod>

  loadDate: (
    date: string,
  ) => Promise<WorkerEarningPeriod>

  loadSince: (
    startDate: string,
  ) => Promise<WorkerEarningPeriod>

  getEarning: (
    earningId: string,
  ) => Promise<WorkerEarning | null>

  getForBooking: (
    bookingId: string,
  ) => Promise<WorkerEarning | null>

  calculateSummary: (
    earnings: WorkerEarning[],
  ) => WorkerEarningSummary

  clearError: () => void
}

export function useWorkerEarnings(
  autoLoad = true,
): UseWorkerEarningsResult {
  const [
    earnings,
    setEarnings,
  ] = useState<WorkerEarning[]>(
    [],
  )

  const [
    summary,
    setSummary,
  ] = useState<WorkerEarningSummary | null>(
    null,
  )

  const [
    period,
    setPeriod,
  ] = useState<WorkerEarningPeriod | null>(
    null,
  )

  const [
    loading,
    setLoading,
  ] = useState(
    autoLoad,
  )

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  )

  const refresh =
    useCallback(
      async (
        limit = 50,
      ): Promise<void> => {
        setLoading(true)
        setError(null)

        try {
          const nextEarnings =
            await getWorkerEarnings(
              limit,
            )

          setEarnings(
            nextEarnings,
          )

          const nextSummary = await getWorkerEarningsSummary()
          setSummary(nextSummary)
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load worker earnings.'

          setError(
            message,
          )
        } finally {
          setLoading(false)
        }
      },
      [],
    )

  useEffect(() => {
    if (!autoLoad) {
      return
    }

    void refresh()
  }, [
    autoLoad,
    refresh,
  ])

  const refreshSummary =
    useCallback(
      async (): Promise<void> => {
        setError(null)

        try {
          const nextSummary =
            await getWorkerEarningsSummary()

          setSummary(
            nextSummary,
          )
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load worker earnings summary.'

          setError(
            message,
          )
        }
      },
      [],
    )

  const loadPeriod =
    useCallback(
      async (
        startDate: string,
        endDate: string,
      ): Promise<WorkerEarningPeriod> => {
        setError(null)

        try {
          const nextPeriod =
            await getWorkerEarningsForPeriod(
              startDate,
              endDate,
            )

          setPeriod(
            nextPeriod,
          )

          return nextPeriod
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load worker earnings for the selected period.'

          setError(
            message,
          )

          throw cause
        }
      },
      [],
    )

  const loadDate =
    useCallback(
      async (
        date: string,
      ): Promise<WorkerEarningPeriod> => {
        setError(null)

        try {
          const nextPeriod =
            await getWorkerEarningsForDate(
              date,
            )

          setPeriod(
            nextPeriod,
          )

          return nextPeriod
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load worker earnings for the selected date.'

          setError(
            message,
          )

          throw cause
        }
      },
      [],
    )

  const loadSince =
    useCallback(
      async (
        startDate: string,
      ): Promise<WorkerEarningPeriod> => {
        setError(null)

        try {
          const nextPeriod =
            await getWorkerEarningsSince(
              startDate,
            )

          setPeriod(
            nextPeriod,
          )

          return nextPeriod
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load worker earnings since the selected date.'

          setError(
            message,
          )

          throw cause
        }
      },
      [],
    )

  const getEarning =
    useCallback(
      async (
        earningId: string,
      ): Promise<WorkerEarning | null> => {
        setError(null)

        try {
          return await getWorkerEarning(
            earningId,
          )
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load worker earning.'

          setError(
            message,
          )

          throw cause
        }
      },
      [],
    )

  const getForBooking =
    useCallback(
      async (
        bookingId: string,
      ): Promise<WorkerEarning | null> => {
        setError(null)

        try {
          return await getWorkerEarningForBooking(
            bookingId,
          )
        } catch (cause) {
          const message =
            cause instanceof Error
              ? cause.message
              : 'Unable to load booking earning.'

          setError(
            message,
          )

          throw cause
        }
      },
      [],
    )

  const calculateSummary =
    useCallback(
      (
        values: WorkerEarning[],
      ): WorkerEarningSummary => {
        return calculateWorkerEarningSummary(
          values,
        )
      },
      [],
    )

  const clearError =
    useCallback(
      (): void => {
        setError(null)
      },
      [],
    )

  return {
    earnings,

    summary,

    period,

    loading,

    error,

    refresh,

    refreshSummary,

    loadPeriod,

    loadDate,

    loadSince,

    getEarning,

    getForBooking,

    calculateSummary,

    clearError,
  }
}