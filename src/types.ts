export interface SlackMessage {
  ts: string
  user: string | null
  username: string | null
  text: string
}

export interface RenderableAnnouncement {
  ts: string
  text: string
  senderName: string
  channelName: string
  permalink: string | null
}
