import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { setupScreenlyMock } from '@screenly/edge-apps/test'

const getLocale = mock(async () => 'en-US')
const getTimeZone = mock(async () => 'UTC')
const formatTime = mock(
  (
    _date: Date,
    _locale: string,
    timezone: string
  ): {
    hour: string
    minute: string
    second: string
    dayPeriod?: string
    formatted: string
  } => {
    if (timezone === 'Asia/Kolkata') {
      return {
        hour: '09',
        minute: '56',
        second: '40',
        dayPeriod: 'PM',
        formatted: '09:56:40 PM',
      }
    }
    if (timezone === 'Europe/London') {
      return {
        hour: '16',
        minute: '26',
        second: '40',
        formatted: '16:26:40',
      }
    }
    return {
      hour: '04',
      minute: '26',
      second: '40',
      dayPeriod: 'PM',
      formatted: '04:26:40 PM',
    }
  }
)

mock.module('@screenly/edge-apps', () => ({
  formatTime,
  getLocale,
  getTimeZone,
}))

const { initLocalization, formatSlackTimestamp } =
  await import('./localization')

const SLACK_TS = '1750000000.000100'

beforeEach(async () => {
  getLocale.mockReset()
  getTimeZone.mockReset()
  formatTime.mockClear()
  getLocale.mockResolvedValue('en-US')
  getTimeZone.mockResolvedValue('UTC')
  setupScreenlyMock()
  await initLocalization()
})

describe('formatSlackTimestamp', () => {
  test('returns an empty string for an invalid Slack timestamp', () => {
    expect(formatSlackTimestamp('not-a-time')).toBe('')
    expect(formatTime).not.toHaveBeenCalled()
  })

  test('formats the message time in the resolved timezone', async () => {
    getTimeZone.mockResolvedValue('Asia/Kolkata')
    await initLocalization()

    expect(formatSlackTimestamp(SLACK_TS)).toBe('09:56 PM')
    expect(formatTime).toHaveBeenCalledWith(
      new Date(Number.parseFloat(SLACK_TS) * 1000),
      'en-US',
      'Asia/Kolkata'
    )
  })

  test('uses the same 12/24-hour layout as the app header', async () => {
    getLocale.mockResolvedValue('en-GB')
    getTimeZone.mockResolvedValue('Europe/London')
    await initLocalization()

    expect(formatSlackTimestamp(SLACK_TS)).toBe('16:26')
  })
})
