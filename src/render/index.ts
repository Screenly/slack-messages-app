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
  message.className = 'message flex flex-col gap-1'

  const sender = document.createElement('div')
  sender.className =
    'message-sender text-[0.8rem] font-semibold text-[#9d9d9f] flex items-baseline gap-2'
  sender.textContent = senderName

  const time = document.createElement('span')
  time.className = 'message-time text-xs font-normal text-[#9d9d9f] opacity-70'
  time.textContent = formatTimestamp(ts)
  sender.appendChild(time)

  const body = document.createElement('div')
  body.className =
    'message-text text-base leading-normal text-[#dadadb] [word-break:break-word] whitespace-pre-wrap'
  body.textContent = text

  message.append(sender, body)
  return message
}

function createChannelCard(
  channelName: string,
  messages: RenderableMessage[]
): HTMLElement {
  const card = document.createElement('div')
  card.className =
    'channel-card bg-[#1a1a1a] border border-[#2a2a2a] rounded-3xl py-6 px-7 flex flex-col gap-4 min-h-0 overflow-hidden'

  const header = document.createElement('div')
  header.className =
    'channel-header text-xl font-bold tracking-[-0.02em] text-[#f2f2f3] flex-shrink-0 pb-3 border-b border-[#2a2a2a]'
  header.textContent = `#${channelName}`
  card.appendChild(header)

  const list = document.createElement('div')
  list.className = 'messages-list flex-1 overflow-auto flex flex-col gap-5'

  if (messages.length === 0) {
    const empty = document.createElement('div')
    empty.className =
      'empty-state text-[#9d9d9f] text-sm text-center m-auto'
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
