import { act, renderHook } from '@testing-library/react-native'
import { useWorkerEarnings } from '../hooks/useWorkerEarnings'

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: 'test-user-id',
          },
        },
        error: null,
      }),
    },

    rpc: jest.fn().mockResolvedValue({
      data: {
        gross_earnings: 1000,
        platform_fees: 100,
        net_earnings: 900,
      },
      error: null,
    }),

    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({
          count: 237,
          error: null,
        }),
      })),
    })),
  },
}))

describe('useWorkerEarnings summary', () => {
  it('loads the aggregate summary and exact earning count', async () => {
    const { result } = await renderHook(
      () => useWorkerEarnings(false),
    )

    await act(async () => {
      await result.current.refreshSummary()
    })

    expect(result.current.summary).toEqual({
      totalGrossAmount: 1000,
      totalPlatformFee: 100,
      totalNetAmount: 900,
      earningCount: 237,
    })

    expect(result.current.error).toBeNull()
  })
})