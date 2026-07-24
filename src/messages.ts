import { reportError } from '@screenly/edge-apps/utils'
import {
  AuthError,
  getConversationHistory,
  getConversationInfo,
  getMessagePermalink,
} from './api'
import { createBoundedCache } from './cache'
import type { SenderNameResolver } from './users'
import type { SlackMessage, RenderableAnnouncement } from './types'

// getConversationHistory() (src/api.ts) filters out subtype 'channel_join'
// events, so fetch a small buffer beyond the single message we render in
// case the most recent event is a join rather than an actual message.
const HISTORY_FETCH_LIMIT = 10

// A message's permalink never changes and a channel's name rarely does, so
// cache both to avoid re-fetching them on every refresh cycle.
const MAX_CACHE_ENTRIES = 50
const getCachedPermalinkValue = createBoundedCache<string>(MAX_CACHE_ENTRIES)
const getCachedChannelNameValue = createBoundedCache<string>(MAX_CACHE_ENTRIES)

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

export interface FetchedMessage {
  message: SlackMessage
  permalink: string | null
  channelName: string
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

  let permalink: string | null = null
  if (fetchPermalink) {
    try {
      permalink = await getCachedPermalink(accessToken, channelId, message.ts)
    } catch (err) {
      if (err instanceof AuthError) throw err
      reportError(err, { source: 'slack-permalink', channelId })
    }
  }

  let channelName = ''
  try {
    channelName = await getCachedChannelName(accessToken, channelId)
  } catch (err) {
    if (err instanceof AuthError) throw err
    reportError(err, { source: 'slack-channel-info', channelId })
  }

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
}> {
  try {
    const result = await fetchLatestMessage(
      accessToken,
      channelId,
      fetchPermalink
    )
    return { result, authError: false, hasFetchError: false }
  } catch (err) {
    if (err instanceof AuthError) {
      return { result: null, authError: true, hasFetchError: false }
    }

    reportError(err, { source: 'slack-content', channelId })
    return { result: null, authError: false, hasFetchError: true }
  }
}

export async function toRenderableAnnouncement(
  accessToken: string,
  result: FetchedMessage,
  showSenderNames: boolean,
  resolveSenderName: SenderNameResolver
): Promise<RenderableAnnouncement> {
  const { message, permalink, channelName } = result
  return {
    ts: message.ts,
    text: message.text,
    senderName:
      showSenderNames && message.user
        ? await resolveSenderName(accessToken, message.user)
        : (message.username ?? message.user ?? 'Unknown'),
    channelName,
    permalink,
  }
}
