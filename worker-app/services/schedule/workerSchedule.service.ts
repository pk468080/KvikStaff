import { supabase } from '../../lib/supabase'
import { apiRequest } from '../../lib/api'

import type {
  WorkerDayOfWeek,
  WorkerSchedule,
  WorkerScheduleSettings,
  WorkerScheduleSettingsInput,
  WorkerWeeklySchedule,
  WorkerWeeklyScheduleInput,
} from '../../types/schedule'


import {
  getWorkerScheduleExceptions,
} from './workerScheduleExceptions.service'
import {
  isScheduleDurationValid,
  isSlotIntervalValid,
  isValidTimeRange,
  isValidTimeString,
} from '../../lib/workerScheduleUtils'

type WorkerWeeklyScheduleRow = {
  id: string
  worker_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type WorkerScheduleSettingsRow = {
  worker_id: string
  timezone: string
  slot_interval_minutes: number | null
  created_at: string
  updated_at: string
}
type WorkerWeeklyScheduleApiResponse = {
  id: string
  worker_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
  updated_at: string
}
function mapWeeklyScheduleApiResponse(
  row: WorkerWeeklyScheduleApiResponse,
): WorkerWeeklySchedule {
  return {
    id: row.id,
    workerId: row.worker_id,
    dayOfWeek:
      row.day_of_week as WorkerDayOfWeek,
    startTime:
      row.start_time,
    endTime:
      row.end_time,
    isActive:
      row.is_active,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  }
}

function mapWeeklySchedule(
  row: WorkerWeeklyScheduleRow,
): WorkerWeeklySchedule {
  return {
    id: row.id,
    workerId: row.worker_id,

    dayOfWeek:
      row.day_of_week as WorkerDayOfWeek,

    startTime:
      row.start_time,

    endTime:
      row.end_time,

    isActive:
      row.is_active,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

function mapScheduleSettings(
  row: WorkerScheduleSettingsRow,
): WorkerScheduleSettings {
  return {
    workerId:
      row.worker_id,

    timezone:
      row.timezone,

    slotIntervalMinutes:
      row.slot_interval_minutes === null
        ? null
        : Number(
            row.slot_interval_minutes,
          ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
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

function validateDayOfWeek(
  dayOfWeek: number,
): asserts dayOfWeek is WorkerDayOfWeek {
  if (
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6
  ) {
    throw new Error(
      'Day of week must be between 0 and 6.',
    )
  }
}

function validateWeeklyScheduleInput(
  input: WorkerWeeklyScheduleInput,
): void {
  validateDayOfWeek(
    input.dayOfWeek,
  )

  if (
    !isValidTimeString(
      input.startTime,
    ) ||
    !isValidTimeString(
      input.endTime,
    )
  ) {
    throw new Error(
      'Schedule times must use HH:MM format.',
    )
  }

  if (
    !isValidTimeRange(
      input.startTime,
      input.endTime,
    )
  ) {
    throw new Error(
      'Schedule end time must be after the start time.',
    )
  }

  if (
    !isScheduleDurationValid(
      input.startTime,
      input.endTime,
    )
  ) {
    throw new Error(
      'A worker schedule window must be at least 30 minutes.',
    )
  }
}

function validateScheduleSettingsInput(
  input: WorkerScheduleSettingsInput,
): void {
  const timezone =
    input.timezone.trim()

  if (!timezone) {
    throw new Error(
      'Schedule timezone is required.',
    )
  }

  if (
    input.slotIntervalMinutes !==
      null &&
    input.slotIntervalMinutes !==
      undefined
  ) {
    if (
      !isSlotIntervalValid(
        input.slotIntervalMinutes,
      )
    ) {
      throw new Error(
        'Slot interval must be between 15 and 120 minutes.',
      )
    }
  }
}

async function validateNoScheduleOverlap(
  workerId: string,
  input: WorkerWeeklyScheduleInput,
  excludeScheduleId?: string,
): Promise<void> {
  if (!input.isActive) {
    return
  }

  let query = supabase
    .from('worker_weekly_schedules')
    .select(
      'id, day_of_week, start_time, end_time, is_active',
    )
    .eq('worker_id', workerId)
    .eq('day_of_week', input.dayOfWeek)
    .eq('is_active', true)

  if (excludeScheduleId) {
    query = query.neq(
      'id',
      excludeScheduleId,
    )
  }

  const {
    data,
    error,
  } = await query

  if (error) {
    throw error
  }

  const overlaps = (data ?? []).some(
    schedule =>
      input.startTime <
        schedule.end_time &&
      input.endTime >
        schedule.start_time,
  )

  if (overlaps) {
    throw new Error(
      'Worker schedule windows cannot overlap on the same day.',
    )
  }
}

export async function getWorkerWeeklySchedules(): Promise<
  WorkerWeeklySchedule[]
> {
  const data =
    await apiRequest<
      WorkerWeeklyScheduleApiResponse[]
    >(
      '/worker/schedule/weekly',
    )

  return data.map(
    mapWeeklyScheduleApiResponse,
  )
}

export async function createWorkerWeeklySchedule(
  input: WorkerWeeklyScheduleInput,
): Promise<WorkerWeeklySchedule> {
  validateWeeklyScheduleInput(
    input,
  )

  const data =
    await apiRequest<
      WorkerWeeklyScheduleApiResponse
    >(
      '/worker/schedule/weekly',
      {
        method: 'POST',
        body: JSON.stringify({
          day_of_week:
            input.dayOfWeek,
          start_time:
            input.startTime,
          end_time:
            input.endTime,
          is_active:
            input.isActive,
        }),
      },
    )

  return mapWeeklyScheduleApiResponse(
    data,
  )
}

export async function updateWorkerWeeklySchedule(
  scheduleId: string,
  input: WorkerWeeklyScheduleInput,
): Promise<WorkerWeeklySchedule> {
  if (!scheduleId.trim()) {
    throw new Error(
      'Schedule id is required.',
    )
  }

  validateWeeklyScheduleInput(
    input,
  )

  const data =
    await apiRequest<
      WorkerWeeklyScheduleApiResponse
    >(
      `/worker/schedule/weekly/${scheduleId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          day_of_week:
            input.dayOfWeek,
          start_time:
            input.startTime,
          end_time:
            input.endTime,
          is_active:
            input.isActive,
        }),
      },
    )

  return mapWeeklyScheduleApiResponse(
    data,
  )
}

export async function deleteWorkerWeeklySchedule(
  scheduleId: string,
): Promise<void> {
  if (!scheduleId.trim()) {
    throw new Error(
      'Schedule id is required.',
    )
  }

  await apiRequest<void>(
    `/worker/schedule/weekly/${scheduleId}`,
    {
      method: 'DELETE',
    },
  )
}

export async function replaceWorkerWeeklySchedules(
  schedules: WorkerWeeklyScheduleInput[],
): Promise<WorkerWeeklySchedule[]> {
  for (const schedule of schedules) {
    validateWeeklyScheduleInput(
      schedule,
    )
  }

  const activeSchedules =
    schedules.filter(
      schedule =>
        schedule.isActive,
    )

  for (
    let index = 0;
    index <
    activeSchedules.length;
    index += 1
  ) {
    const current =
      activeSchedules[index]

    for (
      let nextIndex =
        index + 1;
      nextIndex <
      activeSchedules.length;
      nextIndex += 1
    ) {
      const next =
        activeSchedules[nextIndex]

      if (
        current.dayOfWeek !==
        next.dayOfWeek
      ) {
        continue
      }

      if (
        current.startTime <
          next.endTime &&
        current.endTime >
          next.startTime
      ) {
        throw new Error(
          'Worker schedule windows cannot overlap on the same day.',
        )
      }
    }
  }

  const data =
    await apiRequest<
      WorkerWeeklyScheduleApiResponse[]
    >(
      '/worker/schedule/weekly',
      {
        method: 'PUT',
        body: JSON.stringify({
          schedules:
            schedules.map(
              schedule => ({
                day_of_week:
                  schedule.dayOfWeek,
                start_time:
                  schedule.startTime,
                end_time:
                  schedule.endTime,
                is_active:
                  schedule.isActive,
              }),
            ),
        }),
      },
    )

  return data.map(
    mapWeeklyScheduleApiResponse,
  )
}

export async function getWorkerScheduleSettings(): Promise<
  WorkerScheduleSettings | null
> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('worker_schedule_settings')
    .select(
      'worker_id, timezone, slot_interval_minutes, created_at, updated_at',
    )
    .eq('worker_id', workerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapScheduleSettings(data)
    : null
}

export async function getWorkerSchedule(): Promise<
  WorkerSchedule
> {
  const [
    workerId,
    weeklySchedules,
    exceptions,
    settings,
  ] = await Promise.all([
    getCurrentWorkerId(),
    getWorkerWeeklySchedules(),
    getWorkerScheduleExceptions(),
    getWorkerScheduleSettings(),
  ])

  return {
    workerId,

    weeklySchedules,

    exceptions,

    settings,
  }
}

export async function createWorkerWeeklySchedule(
  input: WorkerWeeklyScheduleInput,
): Promise<WorkerWeeklySchedule> {
  validateWeeklyScheduleInput(
    input,
  )

  const workerId =
    await getCurrentWorkerId()

  await validateNoScheduleOverlap(
    workerId,
    input,
  )

  const {
    data,
    error,
  } = await supabase
    .from('worker_weekly_schedules')
    .insert({
      worker_id:
        workerId,

      day_of_week:
        input.dayOfWeek,

      start_time:
        input.startTime,

      end_time:
        input.endTime,

      is_active:
        input.isActive,
    })
    .select(
      'id, worker_id, day_of_week, start_time, end_time, is_active, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  return mapWeeklySchedule(
    data,
  )
}

export async function updateWorkerWeeklySchedule(
  scheduleId: string,
  input: WorkerWeeklyScheduleInput,
): Promise<WorkerWeeklySchedule> {
  if (!scheduleId.trim()) {
    throw new Error(
      'Schedule id is required.',
    )
  }

  validateWeeklyScheduleInput(
    input,
  )

  const workerId =
    await getCurrentWorkerId()

  await validateNoScheduleOverlap(
    workerId,
    input,
    scheduleId,
  )

  const {
    data,
    error,
  } = await supabase
    .from('worker_weekly_schedules')
    .update({
      day_of_week:
        input.dayOfWeek,

      start_time:
        input.startTime,

      end_time:
        input.endTime,

      is_active:
        input.isActive,
    })
    .eq('id', scheduleId)
    .eq('worker_id', workerId)
    .select(
      'id, worker_id, day_of_week, start_time, end_time, is_active, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  return mapWeeklySchedule(
    data,
  )
}

export async function deleteWorkerWeeklySchedule(
  scheduleId: string,
): Promise<void> {
  if (!scheduleId.trim()) {
    throw new Error(
      'Schedule id is required.',
    )
  }

  const workerId =
    await getCurrentWorkerId()

  const {
    error,
  } = await supabase
    .from('worker_weekly_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('worker_id', workerId)

  if (error) {
    throw error
  }
}

export async function setWorkerScheduleSettings(
  input: WorkerScheduleSettingsInput,
): Promise<WorkerScheduleSettings> {
  validateScheduleSettingsInput(
    input,
  )

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('worker_schedule_settings')
    .upsert(
      {
        worker_id:
          workerId,

        timezone:
          input.timezone.trim(),

        slot_interval_minutes:
          input.slotIntervalMinutes ??
          null,
      },
      {
        onConflict:
          'worker_id',
      },
    )
    .select(
      'worker_id, timezone, slot_interval_minutes, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  return mapScheduleSettings(
    data,
  )
}

export async function deleteWorkerScheduleSettings(): Promise<void> {
  const workerId =
    await getCurrentWorkerId()

  const {
    error,
  } = await supabase
    .from('worker_schedule_settings')
    .delete()
    .eq('worker_id', workerId)

  if (error) {
    throw error
  }
}

export async function replaceWorkerWeeklySchedules(
  schedules: WorkerWeeklyScheduleInput[],
): Promise<WorkerWeeklySchedule[]> {
  const workerId =
    await getCurrentWorkerId()

  for (const schedule of schedules) {
    validateWeeklyScheduleInput(
      schedule,
    )
  }

  const activeSchedules =
    schedules.filter(
      schedule =>
        schedule.isActive,
    )

  for (
    let index = 0;
    index <
    activeSchedules.length;
    index += 1
  ) {
    const current =
      activeSchedules[index]

    for (
      let nextIndex =
        index + 1;
      nextIndex <
      activeSchedules.length;
      nextIndex += 1
    ) {
      const next =
        activeSchedules[nextIndex]

      if (
        current.dayOfWeek !==
        next.dayOfWeek
      ) {
        continue
      }

      if (
        current.startTime <
          next.endTime &&
        current.endTime >
          next.startTime
      ) {
        throw new Error(
          'Worker schedule windows cannot overlap on the same day.',
        )
      }
    }
  }

  const {
    error: deleteError,
  } = await supabase
    .from('worker_weekly_schedules')
    .delete()
    .eq('worker_id', workerId)

  if (deleteError) {
    throw deleteError
  }

  if (schedules.length > 0) {
    const {
      error: insertError,
    } = await supabase
      .from('worker_weekly_schedules')
      .insert(
        schedules.map(
          schedule => ({
            worker_id:
              workerId,

            day_of_week:
              schedule.dayOfWeek,

            start_time:
              schedule.startTime,

            end_time:
              schedule.endTime,

            is_active:
              schedule.isActive,
          }),
        ),
      )

    if (insertError) {
      throw insertError
    }
  }

  return getWorkerWeeklySchedules()
}