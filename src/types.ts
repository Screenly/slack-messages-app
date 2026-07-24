export interface SlackMessage {
  ts: string
  user: string | null
  username: string | null
  text: string
}

export interface TextSegment {
  kind: 'text' | 'user-mention' | 'channel-mention'
  value: string
}

export interface RenderableAnnouncement {
  ts: string
  textSegments: TextSegment[]
  senderName: string
  channelName: string
  permalink: string | null
}
