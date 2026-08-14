import { formatTime, getLocale, getTimeZone } from '@screenly/edge-apps'

let locale = 'en'
let timezone = 'UTC'

export async function initLocalization(): Promise<void> {
  const [resolvedLocale, resolvedTimezone] = await Promise.all([
    getLocale(),
    getTimeZone(),
  ])
  locale = resolvedLocale
  timezone = resolvedTimezone
}

export function formatSlackTimestamp(ts: string): string {
  const millis = Number.parseFloat(ts) * 1000
  if (Number.isNaN(millis)) return ''

  const timeData = formatTime(new Date(millis), locale, timezone)
  return timeData.dayPeriod
    ? `${timeData.hour}:${timeData.minute} ${timeData.dayPeriod}`
    : `${timeData.hour}:${timeData.minute}`
}
