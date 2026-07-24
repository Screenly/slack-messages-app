import { reportError } from '@screenly/edge-apps/utils'
import {
  AuthError,
  getConversationHistory,
  getConversationInfo,
  getMessagePermalink,
  getWorkspaceUrl,
} from './api'
import { createBoundedCache } from './cache'
import { parseMrkdwn } from './mrkdwn'
import type { SenderNameResolver } from './users'
import type { SlackMessage, RenderableAnnouncement } from './types'

// getConversationHistory() (src/api.ts) filters out subtype 'channel_join'
// events, so fetch a small buffer beyond the single message we render in
// case the most recent event is a join rather than an actual message.
const HISTORY_FETCH_LIMIT = 10

// A message's permalink never changes, a channel's name rarely does, and a
// workspace's base URL never changes for a given token, so cache all three
// to avoid re-fetching them on every refresh cycle.
const MAX_CACHE_ENTRIES = 50
const getCachedPermalinkValue = createBoundedCache<string>(MAX_CACHE_ENTRIES)
const getCachedChannelNameValue = createBoundedCache<string>(MAX_CACHE_ENTRIES)
const getCachedWorkspaceUrlValue = createBoundedCache<string>(MAX_CACHE_ENTRIES)

function getCachedPermalink(
  accessToken: string,
  channelId: string,
  messageTs: string
): Promise<string> {
  return getCachedPermalinkValue(`${channelId}:${messageTs}`, () =>
    getMessagePermalink(accessToken, channelId, messageTs)
  )
}

function getCachedChannelName(
  accessToken: string,
  channelId: string
): Promise<string> {
  return getCachedChannelNameValue(channelId, () =>
    getConversationInfo(accessToken, channelId).then((info) => info.name)
  )
}

function getCachedWorkspaceUrl(accessToken: string): Promise<string> {
  return getCachedWorkspaceUrlValue(accessToken, () =>
    getWorkspaceUrl(accessToken)
  )
}

export interface FetchedMessage {
  message: SlackMessage
  permalink: string | null
  channelName: string
}

// Best-effort fetch: a failure here shouldn't block the rest of the render,
// so report it and fall back, but still propagate AuthError so callers can
// retry the whole thing after a token refresh.
async function bestEffort<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  source: string,
  channelId: string
): Promise<T> {
  try {
    return await fetcher()
  } catch (err) {
    if (err instanceof AuthError) throw err
    reportError(err, { source, channelId })
    return fallback
  }
}

async function fetchLatestMessage(
  accessToken: string,
  channelId: string,
  fetchPermalink: boolean
): Promise<FetchedMessage | null> {
  const messages = await getConversationHistory(
    accessToken,
    channelId,
    HISTORY_FETCH_LIMIT
  )
  const message = messages[0]
  if (!message) return null

  const permalink = fetchPermalink
    ? await bestEffort(
        () => getCachedPermalink(accessToken, channelId, message.ts),
        null,
        'slack-permalink',
        channelId
      )
    : null

  const channelName = await bestEffort(
    () => getCachedChannelName(accessToken, channelId),
    '',
    'slack-channel-info',
    channelId
  )

  return { message, permalink, channelName }
}

export async function fetchLatestAnnouncement(
  accessToken: string,
  channelId: string,
  fetchPermalink: boolean
): Promise<{
  result: FetchedMessage | null
  authError: boolean
  // True when the channel raised a genuine fetch error (anything other than
  // an auth error, which is handled separately via retry). Lets callers tell
  // "the channel is legitimately empty" apart from "the channel failed to
  // load".
  hasFetchError: boolean
  // The error behind `hasFetchError`, so callers can decide whether it's
  // eligible for persistent-cache failover (see `errors.ts`). Always null
  // unless `hasFetchError` is true.
  fetchError: Error | null
}> {
  try {
    const result = await fetchLatestMessage(
      accessToken,
      channelId,
      fetchPermalink
    )
    return { result, authError: false, hasFetchError: false, fetchError: null }
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        result: null,
        authError: true,
        hasFetchError: false,
        fetchError: null,
      }
    }

    const error = err instanceof Error ? err : new Error(String(err))
    reportError(error, { source: 'slack-content', channelId })
    return {
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError: error,
    }
  }
}

// Builds a browsable link to the channel itself (not a specific message),
// for use as the empty-state QR target. Best-effort, same as the
// permalink/channel-name fetches above: returns null on failure rather than
// blocking the UI, but still propagates AuthError so callers can retry.
export async function getChannelLink(
  accessToken: string,
  channelId: string
): Promise<string | null> {
  return bestEffort(
    async () => {
      const workspaceUrl = await getCachedWorkspaceUrl(accessToken)
      return `${workspaceUrl.replace(/\/+$/, '')}/archives/${channelId}`
    },
    null,
    'slack-workspace-url',
    channelId
  )
}

export async function toRenderableAnnouncement(
  accessToken: string,
  result: FetchedMessage,
  showSenderNames: boolean,
  resolveSenderName: SenderNameResolver
): Promise<RenderableAnnouncement> {
  const { message, permalink, channelName } = result
  const [senderName, textSegments] = await Promise.all([
    showSenderNames && message.user
      ? resolveSenderName(accessToken, message.user)
      : Promise.resolve(message.username ?? message.user ?? 'Unknown'),
    parseMrkdwn(
      message.text,
      (userId) => resolveSenderName(accessToken, userId),
      (channelId) =>
        getCachedChannelName(accessToken, channelId).catch(() => channelId)
    ),
  ])

  return {
    ts: message.ts,
    textSegments,
    senderName,
    channelName,
    permalink,
  }
}
