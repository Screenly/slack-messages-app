import { getCorsProxyUrl } from '@screenly/edge-apps'
import type { SlackMessage } from '../types'

const SLACK_API_BASE = 'https://slack.com/api'
const AUTH_ERROR_CODES = new Set([
  'invalid_auth',
  'not_authed',
  'token_expired',
  'token_revoked',
])

export class AuthError extends Error {}

function apiUrl(path: string): string {
  return `${getCorsProxyUrl()}/${SLACK_API_BASE}${path}`
}

async function performRequest(
  url: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    throw new Error(
      `Slack could not be reached (${err instanceof Error ? err.message : String(err)}).`,
      { cause: err }
    )
  }
}

async function parseSlackResponse<T>(res: Response, path: string): Promise<T> {
  if (res.status >= 500 || res.status === 429) {
    throw new Error(`Slack's API had a problem (${res.status}).`)
  }
  if (!res.ok) throw new Error(`Slack API error ${res.status}: ${path}`)

  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) {
    if (data.error && AUTH_ERROR_CODES.has(data.error)) {
      throw new AuthError(`Slack auth error: ${data.error}`)
    }
    throw new Error(`Slack API error: ${data.error ?? 'unknown'} (${path})`)
  }

  return data as T
}

async function slackFetch<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const res = await performRequest(`${apiUrl(path)}?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return parseSlackResponse<T>(res, path)
}

export async function getConversationInfo(
  accessToken: string,
  channelId: string
): Promise<{ id: string; name: string }> {
  const data = await slackFetch<{ channel: { id: string; name: string } }>(
    accessToken,
    '/conversations.info',
    { channel: channelId }
  )
  return { id: data.channel.id, name: data.channel.name }
}

export async function getConversationHistory(
  accessToken: string,
  channelId: string,
  limit: number
): Promise<SlackMessage[]> {
  const data = await slackFetch<{
    messages: {
      ts: string
      user?: string
      username?: string
      text?: string
      subtype?: string
    }[]
  }>(accessToken, '/conversations.history', {
    channel: channelId,
    limit: String(limit),
  })

  return data.messages
    .filter((message) => message.subtype !== 'channel_join')
    .map((message) => ({
      ts: message.ts,
      user: message.user ?? null,
      username: message.username ?? null,
      text: message.text ?? '',
    }))
}

export async function getMessagePermalink(
  accessToken: string,
  channelId: string,
  messageTs: string
): Promise<string> {
  const data = await slackFetch<{ permalink: string }>(
    accessToken,
    '/chat.getPermalink',
    { channel: channelId, message_ts: messageTs }
  )
  return data.permalink
}

// auth.test is POST-only, unlike the GET calls in this file, so it can't go
// through slackFetch(); it returns the workspace base URL, used to build a
// browsable channel link since there's no dedicated "get channel URL" endpoint.
export async function getWorkspaceUrl(accessToken: string): Promise<string> {
  const res = await performRequest(apiUrl('/auth.test'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = await parseSlackResponse<{ url: string }>(res, '/auth.test')
  return data.url
}

export async function getUserDisplayName(
  accessToken: string,
  userId: string
): Promise<string> {
  const data = await slackFetch<{
    user: {
      name: string
      real_name?: string
      profile?: { display_name?: string }
    }
  }>(accessToken, '/users.info', { user: userId })

  return (
    data.user.profile?.display_name || data.user.real_name || data.user.name
  )
}
