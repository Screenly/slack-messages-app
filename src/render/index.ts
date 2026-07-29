import qrcode from 'qrcode-generator'
import type { RenderableAnnouncement, TextSegment } from '../types'

const SEGMENT_CLASS_NAMES: Record<TextSegment['kind'], string | null> = {
  text: null,
  'user-mention': 'mention-user',
  'channel-mention': 'mention-channel',
  link: 'mention-link',
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
  header.className = 'announcement-header flex items-center gap-[1.125rem]'

  if (showSenderName) {
    const avatar = document.createElement('div')
    avatar.className =
      'announcement-avatar flex-shrink-0 w-[4.5rem] h-[4.5rem] rounded-full bg-[#4a154b] text-white flex items-center justify-center font-bold text-[1.65rem]'
    avatar.textContent = getInitials(announcement.senderName)
    header.appendChild(avatar)
  }

  const meta = document.createElement('div')
  meta.className = 'announcement-meta min-w-0'

  if (showSenderName) {
    const sender = document.createElement('div')
    sender.className =
      'announcement-sender text-[2.1rem] font-bold leading-[1.3] text-[#1a1a1a]'
    sender.textContent = announcement.senderName
    meta.appendChild(sender)
  }

  const subline = document.createElement('div')
  subline.className = 'announcement-subline text-[1.35rem] text-[#6b6b70]'
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
    const className = SEGMENT_CLASS_NAMES[segment.kind]
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
  main.className = 'announcement-main gap-7'

  main.appendChild(createAnnouncementHeader(announcement, showSenderName))
  main.appendChild(createAnnouncementText(announcement.textSegments))

  return main
}

function createQrPanel(link: string, captionSubtitle: string): HTMLElement {
  const panel = document.createElement('div')
  panel.className =
    'announcement-qr-panel flex-shrink-0 bg-[#e8e8ea] p-12 flex flex-col items-center justify-center gap-5 text-center portrait:flex-row portrait:justify-start portrait:text-left portrait:py-10 portrait:px-14 portrait:gap-9'

  const qr = qrcode(0, 'M')
  qr.addData(link)
  qr.make()

  const svgDoc = new DOMParser().parseFromString(
    qr.createSvgTag({ scalable: true }),
    'image/svg+xml'
  )
  const svg = document.importNode(svgDoc.documentElement, true)
  svg.setAttribute('class', 'block w-full h-full')

  const code = document.createElement('div')
  code.className =
    'qr-code bg-white rounded-xl p-3 w-48 h-48 shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.12)] portrait:w-64 portrait:h-64'
  code.replaceChildren(svg)
  panel.appendChild(code)

  const caption = document.createElement('div')
  caption.className =
    'qr-caption flex flex-col gap-[0.35rem] portrait:text-left'

  const title = document.createElement('div')
  title.className =
    'qr-caption-title text-[1.75rem] font-bold text-[#1a1a1a] portrait:text-[2rem]'
  title.textContent = 'Scan to open in Slack'
  caption.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.className = 'qr-caption-subtitle text-muted-subtitle'
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
  card.className =
    'announcement-card bg-white rounded-3xl shadow-[0_0.5rem_1.25rem_rgba(0,0,0,0.16)] flex flex-row portrait:flex-col max-w-[74rem] portrait:max-w-full w-full max-h-full overflow-hidden'
  card.appendChild(main)

  if (showQrCode && link) {
    const divider = document.createElement('div')
    divider.className =
      'announcement-divider flex-shrink-0 w-[0.0625rem] self-stretch bg-[rgba(0,0,0,0.08)] portrait:w-auto portrait:h-[0.0625rem] portrait:self-auto portrait:mx-14 portrait:my-0'
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

function createEmptyStateMain(): HTMLElement {
  const main = document.createElement('div')
  main.className = 'announcement-main empty-state-main justify-center gap-3'

  const text = document.createElement('div')
  text.className = 'announcement-text'
  text.textContent = 'No new messages yet'
  main.appendChild(text)

  const subtitle = document.createElement('div')
  subtitle.className = 'empty-state-subtitle text-muted-subtitle'
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
