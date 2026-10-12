import { renderHook, act } from '@testing-library/react-hooks'
import { useWorkerEarnings } from '../hooks/useWorkerEarnings'

// Mock supabase client
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

describe('useWorkerEarnings summary regression', () => {
  it('calls getWorkerEarningsSummary via refreshSummary', async () => {
    const { result } = renderHook(() => useWorkerEarnings(false))

    await act(async () => {
      await result.current.refreshSummary()
    })

    expect(result.current.summary).toBeDefined()
  })
})
