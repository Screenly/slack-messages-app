import {
  REDIRECT_URI,
  SLACK_AUTH_URL,
  SLACK_TOKEN_URL,
  SLACK_USER_SCOPES,
} from './constants'
import type { StoredTokens } from './db'

interface SlackTokenResponse {
  ok: boolean
  error?: string
  team?: { id: string; name: string }
  // User-token grants are returned here, not at the top level, since we
  // request `user_scope` rather than `scope` (bot scopes).
  authed_user?: {
    access_token?: string
    scope?: string
    refresh_token?: string
    expires_in?: number
  }
}

export function createAuthorizationUrl(
  clientId: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
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
  response: SlackTokenResponse & { authed_user: { access_token: string } }
): StoredTokens {
  const { authed_user } = response
  return {
    access_token: authed_user.access_token,
    refresh_token: authed_user.refresh_token ?? null,
    scope: authed_user.scope ?? '',
    team_name: response.team?.name ?? 'Unknown workspace',
    expires_at: authed_user.expires_in
      ? Math.floor(Date.now() / 1000) + authed_user.expires_in
      : null,
  }
}
