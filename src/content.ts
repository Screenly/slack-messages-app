export function parseChannelId(rawChannelId: string): string {
  const channelId = rawChannelId.trim()

  if (channelId.length === 0) {
    throw new Error('No Slack channel ID configured.')
  }

  return channelId
}
