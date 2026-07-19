import type { RenderableChannelFeed, RenderableMessage } from '../types'

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatTimestamp(ts: string): string {
  const millis = Number.parseFloat(ts) * 1000
  if (Number.isNaN(millis)) return ''
  return timeFormatter.format(new Date(millis))
}

function createMessageElement(
  senderName: string,
  text: string,
  ts: string
): HTMLElement {
  const message = document.createElement('div')
  message.className = 'message'

  const sender = document.createElement('div')
  sender.className = 'message-sender'
  sender.textContent = senderName

  const time = document.createElement('span')
  time.className = 'message-time'
  time.textContent = formatTimestamp(ts)
  sender.appendChild(time)

  const body = document.createElement('div')
  body.className = 'message-text'
  body.textContent = text

  message.append(sender, body)
  return message
}

function createChannelCard(
  channelName: string,
  messages: RenderableMessage[]
): HTMLElement {
  const card = document.createElement('div')
  card.className = 'channel-card'

  const header = document.createElement('div')
  header.className = 'channel-header'
  header.textContent = `#${channelName}`
  card.appendChild(header)

  const list = document.createElement('div')
  list.className = 'messages-list'

  if (messages.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'No messages yet.'
    list.appendChild(empty)
  } else {
    for (const { senderName, text, ts } of messages) {
      list.appendChild(createMessageElement(senderName, text, ts))
    }
  }

  card.appendChild(list)
  return card
}

export function renderFeeds(feeds: RenderableChannelFeed[]): void {
  const channelsGrid = document.getElementById('channels-grid')
  if (!channelsGrid) return

  channelsGrid.innerHTML = ''

  for (const feed of feeds) {
    channelsGrid.appendChild(
      createChannelCard(feed.channel.name, feed.messages)
    )
  }
}

export function showScreen(screenId: string): void {
  const screens = ['feed-screen', 'error-screen']
  screens.forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.style.display = id === screenId ? 'flex' : 'none'
  })
}

export function showError(message: string): void {
  showScreen('error-screen')
  const el = document.getElementById('error-message')
  if (el) el.textContent = message
}
