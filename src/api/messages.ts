import { getSettingWithDefault } from '@screenly/edge-apps'
import { reportError } from '@screenly/edge-apps/utils'
import { DEFAULT_SHOW_QR_CODE, DEFAULT_SHOW_SENDER_NAMES } from '../constants'
import {
  AuthError,
  NotInChannelError,
  getConversationHistory,
  getConversationInfo,
  getMessagePermalink,
  getWorkspaceUrl,
} from './slack'
import { createBoundedCache } from './bounded-cache'
import { parseMrkdwn } from './mrkdwn'
import type { SenderNameResolver } from './users'
import type { SlackMessage, RenderableAnnouncement } from '../types'

// getConversationHistory() (src/api/slack.ts) filters out subtype 'channel_join'
// events, so fetch a small buffer beyond the single message we render in
// case the most recent event is a join rather than an actual message.
const HISTORY_FETCH_LIMIT = 10

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
  accessToken: string
): Promise<FetchedMessage | null> {
  const channelId = getSettingWithDefault('channel_id', '')
  const messages = await getConversationHistory(
    accessToken,
    channelId,
    HISTORY_FETCH_LIMIT
  )
  const message = messages[0]
  if (!message) return null

  const showQrCode = getSettingWithDefault('show_qr_code', DEFAULT_SHOW_QR_CODE)
  const permalink = showQrCode
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

export async function fetchLatestAnnouncement(accessToken: string): Promise<{
  result: FetchedMessage | null
  authError: boolean
  hasFetchError: boolean
  notInChannel: boolean
  fetchError: Error | null
}> {
  try {
    const result = await fetchLatestMessage(accessToken)
    return {
      result,
      authError: false,
      hasFetchError: false,
      notInChannel: false,
      fetchError: null,
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        result: null,
        authError: true,
        hasFetchError: false,
        notInChannel: false,
        fetchError: null,
      }
    }

    if (err instanceof NotInChannelError) {
      return {
        result: null,
        authError: false,
        hasFetchError: true,
        notInChannel: true,
        fetchError: null,
      }
    }

    const error = err instanceof Error ? err : new Error(String(err))
    reportError(error, {
      source: 'slack-content',
      channelId: getSettingWithDefault('channel_id', ''),
    })
    return {
      result: null,
      authError: false,
      hasFetchError: true,
      notInChannel: false,
      fetchError: error,
    }
  }
}

export async function getChannelLink(
  accessToken: string
): Promise<string | null> {
  const channelId = getSettingWithDefault('channel_id', '')
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
  resolveSenderName: SenderNameResolver
): Promise<RenderableAnnouncement> {
  const { message, permalink, channelName } = result
  const showSenderNames = getSettingWithDefault(
    'show_sender_names',
    DEFAULT_SHOW_SENDER_NAMES
  )
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
