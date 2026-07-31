import {
  REDIRECT_URI,
  SLACK_AUTH_URL,
  SLACK_BOT_SCOPES,
  SLACK_TOKEN_URL,
  SLACK_USER_SCOPES,
} from './constants'
import type { StoredTokens } from './db'

interface SlackTokenResponse {
  ok: boolean
  error?: string
  access_token?: string
  scope?: string
  team?: { id: string; name: string }
  expires_in?: number
  refresh_token?: string
  authed_user?: {
    id: string
    access_token?: string
    scope?: string
  }
}

export function createAuthorizationUrl(
  clientId: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SLACK_BOT_SCOPES,
    user_scope: SLACK_USER_SCOPES,
    state,
  })
  return `${SLACK_AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string
): Promise<SlackTokenResponse | null> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  )
  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  })

  const data = (await res.json()) as SlackTokenResponse
  if (!data.ok) {
    console.error(`Token exchange failed: ${data.error ?? 'unknown error'}`)
    return null
  }
  return data
}

export function toStoredTokens(
  response: SlackTokenResponse & { access_token: string }
): StoredTokens {
  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token ?? null,
    scope: response.scope ?? '',
    team_name: response.team?.name ?? 'Unknown workspace',
    expires_at: response.expires_in
      ? Math.floor(Date.now() / 1000) + response.expires_in
      : null,
    user_access_token: response.authed_user?.access_token ?? null,
    user_scope: response.authed_user?.scope ?? null,
  }
}
