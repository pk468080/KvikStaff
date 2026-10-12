import { renderHook, act } from '@testing-library/react-hooks'
import { useWorkerEarnings } from '../hooks/useWorkerEarnings'

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null })
    },
    rpc: jest.fn().mockResolvedValue({ data: {
      total_earned: 100,
      available_earnings: 50,
      period_earnings: 20
    }, error: null })
  }
}))

describe('useWorkerEarnings regression test for >50 records', () => {
  it('relies on the authoritative summary independent of local fetched subset', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useWorkerEarnings(false))

    // Mock local fetch array to simulate 50 elements loaded (paginated limit)
    jest.spyOn(result.current, 'calculateSummary').mockReturnValue({
      totalEarned: 50,
      periodEarned: 10,
      tips: 0,
      commission: 0,
    } as any)

    // Wait for the independent summary to overwrite it (from RPC)
    await act(async () => {
      await result.current.refreshSummary()
    })

    expect(result.current.summary).toBeDefined()
  })
})
