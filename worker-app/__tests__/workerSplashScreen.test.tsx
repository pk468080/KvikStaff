import {
  act,
  fireEvent,
  render,
} from '@testing-library/react-native'

import { UI } from '../constants/ui'
import SplashScreen from '../screens/auth/SplashScreen'
import {
  getWorkerAuthState,
} from '../services/auth/workerAuth.service'
import type {
  WorkerAuthState,
} from '../services/auth/workerAuth.service'

jest.mock('../services/auth/workerAuth.service', () => ({
  getWorkerAuthState: jest.fn(),
}))

const mockGetWorkerAuthState = jest.mocked(getWorkerAuthState)

const restoredWorkerState: WorkerAuthState = {
  authenticated: true,
  needsRegistration: false,
  email: 'worker@example.com',
}

const AUTH_RESTORE_TIMEOUT_MS = 15_000

beforeEach(() => {
  jest.useFakeTimers()
  mockGetWorkerAuthState.mockReset()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('Worker SplashScreen', () => {
  it('finishes after auth state resolves and the minimum splash duration passes', async () => {
    const onFinished = jest.fn()
    mockGetWorkerAuthState.mockResolvedValue(restoredWorkerState)

    render(<SplashScreen onFinished={onFinished} />)

    expect(onFinished).not.toHaveBeenCalled()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(UI.splashDuration)
    })

    expect(onFinished).toHaveBeenCalledWith(restoredWorkerState)
  })

  it('shows a retry state when auth restoration rejects instead of treating the worker as logged out', async () => {
    const onFinished = jest.fn()
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockGetWorkerAuthState.mockRejectedValue(new Error('network unavailable'))

    const { getByText, getByLabelText } = render(
      <SplashScreen onFinished={onFinished} />,
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(UI.splashDuration)
    })

    expect(getByText('Unable to connect')).toBeTruthy()
    expect(getByLabelText('Retry session restoration')).toBeTruthy()
    expect(onFinished).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalled()
  })

  it('shows a retry state on timeout and succeeds after retry', async () => {
    const onFinished = jest.fn()
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    mockGetWorkerAuthState
      .mockImplementationOnce(
        () => new Promise<WorkerAuthState>(() => undefined),
      )
      .mockResolvedValueOnce(restoredWorkerState)

    const { getByText, getByLabelText } = render(
      <SplashScreen onFinished={onFinished} />,
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTH_RESTORE_TIMEOUT_MS)
    })

    expect(getByText('Unable to connect')).toBeTruthy()
    expect(onFinished).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalled()

    fireEvent.press(getByLabelText('Retry session restoration'))

    await act(async () => {
      await jest.advanceTimersByTimeAsync(UI.splashDuration)
    })

    expect(mockGetWorkerAuthState).toHaveBeenCalledTimes(2)
    expect(onFinished).toHaveBeenCalledWith(restoredWorkerState)
  })
})
