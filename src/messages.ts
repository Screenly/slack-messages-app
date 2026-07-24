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

export async function fetchAllLatestMessages(
  accessToken: string,
  channelIds: string[],
  fetchPermalink: boolean
): Promise<{
  results: FetchedMessage[]
  authError: boolean
  // True when at least one channel raised a genuine fetch error (anything
  // other than an auth error, which is handled separately via retry). Lets
  // callers tell "every channel is legitimately empty" apart from "every
  // channel failed to load".
  hasFetchError: boolean
}> {
  const settled = await Promise.allSettled(
    channelIds.map((channelId) =>
      fetchLatestMessage(accessToken, channelId, fetchPermalink)
    )
  )

  const results: FetchedMessage[] = []
  let authError = false
  let hasFetchError = false

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value) results.push(result.value)
      return
    }

    if (result.reason instanceof AuthError) {
      authError = true
      return
    }

    hasFetchError = true
    reportError(result.reason, {
      source: 'slack-content',
      channelId: channelIds[index],
    })
  })

  return { results, authError, hasFetchError }
}

export async function toRenderableAnnouncements(
  accessToken: string,
  results: FetchedMessage[],
  showSenderNames: boolean,
  resolveSenderName: SenderNameResolver
): Promise<RenderableAnnouncement[]> {
  return Promise.all(
    results.map(async ({ message, permalink, channelName }) => ({
      ts: message.ts,
      text: message.text,
      senderName:
        showSenderNames && message.user
          ? await resolveSenderName(accessToken, message.user)
          : (message.username ?? message.user ?? 'Unknown'),
      channelName,
      permalink,
    }))
  )
}
