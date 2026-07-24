import { reportError } from '@screenly/edge-apps/utils'
import {
  AuthError,
  getConversationHistory,
  getConversationInfo,
  getMessagePermalink,
  getWorkspaceUrl,
} from './api'
import { createBoundedCache } from './cache'
import type { SenderNameResolver } from './users'
import type { SlackMessage, RenderableAnnouncement, TextSegment } from './types'

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

// Slack's mrkdwn wraps entity references and links in angle brackets, e.g.
// `<@U0123>` (user mention), `<#C0123|general>` (channel mention, name
// usually inlined), `<!channel>`/`<!here>`/`<!everyone>` (broadcasts), and
// `<https://example.com|label>` (links). Left as-is, these show up as raw
// tokens on screen instead of readable text.
const MRKDWN_TOKEN_PATTERN = /<([^>]+)>/g

// A token's body is everything after the sigil (@/#/!), optionally followed
// by a `|`-separated fallback label - this returns just the id/keyword part.
function tokenIdPart(token: string): string {
  return token.slice(1).split('|')[0]
}

async function resolveMrkdwnToken(
  token: string,
  accessToken: string,
  resolveSenderName: SenderNameResolver
): Promise<TextSegment> {
  if (token.startsWith('@')) {
    const name = await resolveSenderName(accessToken, tokenIdPart(token))
    return { kind: 'user-mention', value: `@${name}` }
  }

  if (token.startsWith('#')) {
    const [channelId, inlineName] = token.slice(1).split('|')
    const name =
      inlineName ??
      (await getCachedChannelName(accessToken, channelId).catch(
        () => channelId
      ))
    return { kind: 'channel-mention', value: `#${name}` }
  }

  if (token.startsWith('!')) {
    return { kind: 'text', value: `@${tokenIdPart(token)}` }
  }

  // Link: <https://example.com|label> or bare <https://example.com>.
  const [url, label] = token.split('|')
  return { kind: 'text', value: label ?? url }
}

async function parseMrkdwn(
  text: string,
  accessToken: string,
  resolveSenderName: SenderNameResolver
): Promise<TextSegment[]> {
  const segments: TextSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(MRKDWN_TOKEN_PATTERN)) {
    const [fullMatch, token] = match
    const index = match.index ?? 0

    if (index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, index) })
    }

    segments.push(
      await resolveMrkdwnToken(token, accessToken, resolveSenderName)
    )
    lastIndex = index + fullMatch.length
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) })
  }

  return segments
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
    parseMrkdwn(message.text, accessToken, resolveSenderName),
  ])

  return {
    ts: message.ts,
    textSegments,
    senderName,
    channelName,
    permalink,
  }
}
