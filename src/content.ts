export function parseChannelIds(rawChannelIds: string): string[] {
  const channelIds = rawChannelIds
    .split(',')
    .map((channelId) => channelId.trim())
    .filter((channelId) => channelId.length > 0)

  if (channelIds.length === 0) {
    throw new Error('No Slack channel IDs configured.')
  }

  return [...new Set(channelIds)]
}
