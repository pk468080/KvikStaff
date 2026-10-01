import {
  formatUnreadNotificationCount,
} from './customerNotifications.service'

describe('formatUnreadNotificationCount', () => {
  it('formats zero unread notifications', () => {
    expect(
      formatUnreadNotificationCount(0),
    ).toBe('0')
  })

  it('formats a single unread notification', () => {
    expect(
      formatUnreadNotificationCount(1),
    ).toBe('1')
  })

  it('keeps counts below one hundred exact', () => {
    expect(
      formatUnreadNotificationCount(99),
    ).toBe('99')
  })

  it('caps counts at ninety-nine plus', () => {
    expect(
      formatUnreadNotificationCount(100),
    ).toBe('99+')
    expect(
      formatUnreadNotificationCount(1000),
    ).toBe('99+')
  })
})