import { registerWorkerPushToken } from '../services/notifications/workerNotifications.service'

// Mock supabase client
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null })
    },
    rpc: jest.fn().mockResolvedValue({ data: { user_id: 'test-user-id', token: 'ExponentPushToken[abc123]' }, error: null })
  }
}))

describe('Push token validation', () => {
  it('accepts valid tokens', async () => {
    const token = 'ExponentPushToken[abc123]'
    const result = await registerWorkerPushToken(token)
    expect(result).toBeDefined()
  })

  it('rejects empty tokens', async () => {
    await expect(registerWorkerPushToken('  ')).rejects.toThrow('Push token is required.')
  })

  it('rejects malformed tokens', async () => {
    await expect(registerWorkerPushToken('InvalidToken')).rejects.toThrow('Invalid Expo push token.')
  })

  it('rejects trailing characters', async () => {
    await expect(registerWorkerPushToken('ExponentPushToken[abc123]trailing')).rejects.toThrow('Invalid Expo push token.')
  })
})
