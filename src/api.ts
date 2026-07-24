import { getCorsProxyUrl } from '@screenly/edge-apps'
import type { SlackMessage } from './types'

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

async function slackFetch<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`${apiUrl(path)}?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

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
