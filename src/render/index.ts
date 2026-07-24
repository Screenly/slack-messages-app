import qrcode from 'qrcode-generator'
import type { RenderableAnnouncement, TextSegment } from '../types'

const MENTION_CLASS_NAMES: Record<TextSegment['kind'], string | null> = {
  text: null,
  'user-mention': 'mention-user',
  'channel-mention': 'mention-channel',
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatTimestamp(ts: string): string {
  const millis = Number.parseFloat(ts) * 1000
  if (Number.isNaN(millis)) return ''
  return timeFormatter.format(new Date(millis))
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function createAnnouncementHeader(
  announcement: RenderableAnnouncement,
  showSenderName: boolean
): HTMLElement {
  const header = document.createElement('div')
  header.className = 'announcement-header'

  if (showSenderName) {
    const avatar = document.createElement('div')
    avatar.className = 'announcement-avatar'
    avatar.textContent = getInitials(announcement.senderName)
    header.appendChild(avatar)
  }

  const meta = document.createElement('div')
  meta.className = 'announcement-meta'

  if (showSenderName) {
    const sender = document.createElement('div')
    sender.className = 'announcement-sender'
    sender.textContent = announcement.senderName
    meta.appendChild(sender)
  }

  const subline = document.createElement('div')
  subline.className = 'announcement-subline'
  subline.textContent = [
    announcement.channelName && `#${announcement.channelName}`,
    formatTimestamp(announcement.ts),
  ]
    .filter(Boolean)
    .join(' · ')
  meta.appendChild(subline)

  header.appendChild(meta)
  return header
}

function createAnnouncementText(segments: TextSegment[]): HTMLElement {
  const text = document.createElement('div')
  text.className = 'announcement-text'

  for (const segment of segments) {
    const className = MENTION_CLASS_NAMES[segment.kind]
    if (!className) {
      text.appendChild(document.createTextNode(segment.value))
      continue
    }

    const span = document.createElement('span')
    span.className = className
    span.textContent = segment.value
    text.appendChild(span)
  }

  return text
}

function createAnnouncementMain(
  announcement: RenderableAnnouncement,
  showSenderName: boolean
): HTMLElement {
  const main = document.createElement('div')
  main.className = 'announcement-main'

  main.appendChild(createAnnouncementHeader(announcement, showSenderName))
  main.appendChild(createAnnouncementText(announcement.textSegments))

  return main
}

function createQrPanel(link: string, captionSubtitle: string): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'announcement-qr-panel'

  const qr = qrcode(0, 'M')
  qr.addData(link)
  qr.make()

  const svgDoc = new DOMParser().parseFromString(
    qr.createSvgTag({ scalable: true }),
    'image/svg+xml'
  )

  const code = document.createElement('div')
  code.className = 'qr-code'
  code.replaceChildren(document.importNode(svgDoc.documentElement, true))
  panel.appendChild(code)

  const caption = document.createElement('div')
  caption.className = 'qr-caption'

  const title = document.createElement('div')
  title.className = 'qr-caption-title'
  title.textContent = 'Scan to open in Slack'
  caption.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.className = 'qr-caption-subtitle'
  subtitle.textContent = captionSubtitle
  caption.appendChild(subtitle)

  panel.appendChild(caption)

  return panel
}

function createAnnouncementLayout(
  main: HTMLElement,
  showQrCode: boolean,
  link: string | null,
  captionSubtitle: string
): HTMLElement {
  const card = document.createElement('div')
  card.className = 'announcement-card'
  card.appendChild(main)

  if (showQrCode && link) {
    const divider = document.createElement('div')
    divider.className = 'announcement-divider'
    card.appendChild(divider)
    card.appendChild(createQrPanel(link, captionSubtitle))
  }

  return card
}

function createAnnouncementCard(
  announcement: RenderableAnnouncement,
  showSenderName: boolean,
  showQrCode: boolean
): HTMLElement {
  return createAnnouncementLayout(
    createAnnouncementMain(announcement, showSenderName),
    showQrCode,
    announcement.permalink,
    'View this message on your phone'
  )
}

// Reuses the same two-panel announcement-card layout (main + divider + QR
// panel) so a legitimately empty channel reads as a calm, on-brand state
// rather than a bespoke smaller card - just without the header, since
// there's no message to show, and linking the QR to the channel itself
// (not a specific message) since there's nothing to permalink to.
function createEmptyStateMain(): HTMLElement {
  const main = document.createElement('div')
  main.className = 'announcement-main empty-state-main'

  const text = document.createElement('div')
  text.className = 'announcement-text'
  text.textContent = 'No new messages yet'
  main.appendChild(text)

  const subtitle = document.createElement('div')
  subtitle.className = 'empty-state-subtitle'
  subtitle.textContent = 'New messages will appear here on the next refresh'
  main.appendChild(subtitle)

  return main
}

function createEmptyStateCard(
  showQrCode: boolean,
  channelLink: string | null
): HTMLElement {
  return createAnnouncementLayout(
    createEmptyStateMain(),
    showQrCode,
    channelLink,
    'View this channel on your phone'
  )
}

export function renderAnnouncement(
  announcement: RenderableAnnouncement | null,
  showSenderName: boolean,
  showQrCode: boolean,
  channelLink: string | null = null
): void {
  const screen = document.getElementById('message-screen')
  if (!screen) return

  screen.replaceChildren(
    announcement
      ? createAnnouncementCard(announcement, showSenderName, showQrCode)
      : createEmptyStateCard(showQrCode, channelLink)
  )
}

export function showMessageScreen(): void {
  const el = document.getElementById('message-screen')
  if (el) el.style.display = 'flex'
}
