import { getWorkerLocationAgeSeconds, WorkerLocation } from './bookingTracking.service'

describe('getWorkerLocationAgeSeconds', () => {
  it('returns null if location is null', () => {
    expect(getWorkerLocationAgeSeconds(null)).toBeNull()
  })

  it('returns null if recorded_at is invalid', () => {
    const loc: WorkerLocation = {
      latitude: 0,
      longitude: 0,
      recorded_at: 'invalid-date',
    }
    expect(getWorkerLocationAgeSeconds(loc)).toBeNull()
  })

  it('calculates the age correctly', () => {
    const nowMs = 1700000000000
    const loc: WorkerLocation = {
      latitude: 0,
      longitude: 0,
      // 10 seconds before now
      recorded_at: new Date(nowMs - 10000).toISOString(),
    }
    expect(getWorkerLocationAgeSeconds(loc, nowMs)).toBe(10)
  })

  it('truncates milliseconds to full seconds using Math.floor', () => {
    const nowMs = 1700000000000
    const loc: WorkerLocation = {
      latitude: 0,
      longitude: 0,
      // 10.9 seconds before now (10900 ms)
      recorded_at: new Date(nowMs - 10900).toISOString(),
    }
    // Should floor to 10 seconds
    expect(getWorkerLocationAgeSeconds(loc, nowMs)).toBe(10)
  })

  it('handles negative age (future recorded_at) by returning 0', () => {
    const nowMs = 1700000000000
    const loc: WorkerLocation = {
      latitude: 0,
      longitude: 0,
      // 10 seconds in the future
      recorded_at: new Date(nowMs + 10000).toISOString(),
    }
    expect(getWorkerLocationAgeSeconds(loc, nowMs)).toBe(0)
  })
})
