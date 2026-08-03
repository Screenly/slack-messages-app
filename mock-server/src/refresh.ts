import { SLACK_TOKEN_URL } from './constants'
import { loadTokens, saveTokens } from './db'

const REFRESH_SAFETY_MARGIN_MS = 5 * 60 * 1000
const MIN_REFRESH_DELAY_MS = 60 * 1000

let refreshTimer: ReturnType<typeof setTimeout> | undefined

interface RefreshResponse {
  ok: boolean
  error?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

async function refreshTokens(): Promise<void> {
  const tokens = loadTokens()
  if (!tokens?.refresh_token) return

  const clientId = process.env.SLACK_CLIENT_ID!
  const clientSecret = process.env.SLACK_CLIENT_SECRET!
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }).toString(),
  })

  const data = (await res.json()) as RefreshResponse

  if (!data.ok || !data.access_token) {
    console.error(`Token refresh failed: ${data.error ?? 'unknown error'}`)
    return
  }

  saveTokens({
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    expires_at: data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : null,
  })

  console.log(`Access token refreshed at ${new Date().toISOString()}`)
  scheduleNextRefresh()
}

function scheduleNextRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)

  // Only Slack apps with token rotation enabled return a refresh_token and
  // expires_at; without rotation, bot tokens don't expire, so there's
  // nothing to schedule.
  const tokens = loadTokens()
  if (!tokens?.refresh_token || !tokens.expires_at) return

  const delayMs = Math.max(
    tokens.expires_at * 1000 - Date.now() - REFRESH_SAFETY_MARGIN_MS,
    MIN_REFRESH_DELAY_MS
  )

  refreshTimer = setTimeout(() => {
    refreshTokens().catch((err) => console.error('Token refresh error:', err))
  }, delayMs)
}

export function startRefreshLoop(): void {
  scheduleNextRefresh()
}
