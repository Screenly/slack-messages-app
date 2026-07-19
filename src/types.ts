export interface SlackMessage {
  ts: string
  user: string | null
  username: string | null
  text: string
}

export interface SlackChannel {
  id: string
  name: string
}

export interface ChannelFeed {
  channel: SlackChannel
  messages: SlackMessage[]
}

export interface RenderableMessage {
  ts: string
  text: string
  senderName: string
}

export interface RenderableChannelFeed {
  channel: SlackChannel
  messages: RenderableMessage[]
}
