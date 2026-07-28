import type { TextSegment } from './types'

export type UserMentionResolver = (userId: string) => Promise<string>
export type ChannelMentionResolver = (channelId: string) => Promise<string>

const MRKDWN_TOKEN_PATTERN = /<([^>]+)>/g

function tokenIdPart(token: string): string {
  return token.slice(1).split('|')[0]
}

async function resolveUserMention(
  token: string,
  userResolver: UserMentionResolver
): Promise<TextSegment> {
  const name = await userResolver(tokenIdPart(token))
  return { kind: 'user-mention', value: `@${name}` }
}

async function resolveChannelMention(
  token: string,
  channelResolver: ChannelMentionResolver
): Promise<TextSegment> {
  const [channelId, inlineName] = token.slice(1).split('|')
  const name = inlineName ?? (await channelResolver(channelId))
  return { kind: 'channel-mention', value: `#${name}` }
}

function resolveBroadcast(token: string): TextSegment {
  return { kind: 'text', value: `@${tokenIdPart(token)}` }
}

function resolveLink(token: string): TextSegment {
  const [url, label] = token.split('|')
  return { kind: 'text', value: label ?? url }
}

async function resolveToken(
  token: string,
  userResolver: UserMentionResolver,
  channelResolver: ChannelMentionResolver
): Promise<TextSegment> {
  if (token.startsWith('@')) {
    return resolveUserMention(token, userResolver)
  }
  if (token.startsWith('#')) {
    return resolveChannelMention(token, channelResolver)
  }
  if (token.startsWith('!')) return resolveBroadcast(token)
  return resolveLink(token)
}

export async function parseMrkdwn(
  text: string,
  userResolver: UserMentionResolver,
  channelResolver: ChannelMentionResolver
): Promise<TextSegment[]> {
  const segments: TextSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(MRKDWN_TOKEN_PATTERN)) {
    const [fullMatch, token] = match
    const index = match.index ?? 0

    if (index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, index) })
    }

    segments.push(await resolveToken(token, userResolver, channelResolver))
    lastIndex = index + fullMatch.length
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
