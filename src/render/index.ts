import qrcode from 'qrcode-generator'
import type { RenderableAnnouncement } from '../types'

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const DEFAULT_ROTATION_SECONDS = 15

let rotationTimer: ReturnType<typeof setInterval> | undefined
let rotationIndex = 0

function sanitizeRotationSeconds(rotationSeconds: number): number {
  return Number.isFinite(rotationSeconds) && rotationSeconds > 0
    ? rotationSeconds
    : DEFAULT_ROTATION_SECONDS
}

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

function createAnnouncementMain(
  announcement: RenderableAnnouncement,
  showSenderName: boolean
): HTMLElement {
  const main = document.createElement('div')
  main.className = 'announcement-main'

  main.appendChild(createAnnouncementHeader(announcement, showSenderName))

  const text = document.createElement('div')
  text.className = 'announcement-text'
  text.textContent = announcement.text
  main.appendChild(text)

  return main
}

function createQrPanel(permalink: string): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'announcement-qr-panel'

  const qr = qrcode(0, 'M')
  qr.addData(permalink)
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
  subtitle.textContent = 'View this message on your phone'
  caption.appendChild(subtitle)

  panel.appendChild(caption)

  return panel
}

function createAnnouncementCard(
  announcement: RenderableAnnouncement,
  showSenderName: boolean,
  showQrCode: boolean
): HTMLElement {
  const card = document.createElement('div')
  card.className = 'announcement-card'

  card.appendChild(createAnnouncementMain(announcement, showSenderName))

  if (showQrCode && announcement.permalink) {
    const divider = document.createElement('div')
    divider.className = 'announcement-divider'
    card.appendChild(divider)

    card.appendChild(createQrPanel(announcement.permalink))
  }

  return card
}

// Reuses the same card look as an announcement (white, rounded corners,
// centered) so a legitimately empty channel reads as a calm, on-brand state
// rather than bare floating text - just without the header/QR, since
// there's no message to show or link to.
function createEmptyStateCard(): HTMLElement {
  const card = document.createElement('div')
  card.className = 'announcement-card empty-state-card'

  const text = document.createElement('div')
  text.className = 'announcement-text'
  text.textContent = 'No messages yet'
  card.appendChild(text)

  return card
}

export function renderAnnouncements(
  announcements: RenderableAnnouncement[],
  showSenderName: boolean,
  showQrCode: boolean,
  rotationSeconds: number
): void {
  const screen = document.getElementById('message-screen')
  if (!screen) return

  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = undefined
  }

  screen.innerHTML = ''
  if (announcements.length === 0) {
    rotationIndex = 0
    screen.appendChild(createEmptyStateCard())
    return
  }

  // Keep the rotation position across re-renders (e.g. periodic refreshes)
  // instead of resetting to the first announcement every time.
  rotationIndex = rotationIndex % announcements.length

  const showCurrent = () => {
    screen.replaceChildren(
      createAnnouncementCard(
        announcements[rotationIndex],
        showSenderName,
        showQrCode
      )
    )
  }

  showCurrent()

  if (announcements.length > 1) {
    rotationTimer = setInterval(
      () => {
        rotationIndex = (rotationIndex + 1) % announcements.length
        showCurrent()
      },
      sanitizeRotationSeconds(rotationSeconds) * 1000
    )
  }
}

export function showScreen(screenId: string): void {
  const screens = ['message-screen', 'error-screen']
  screens.forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.style.display = id === screenId ? 'flex' : 'none'
  })
}

export function showError(message: string): void {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = undefined
  }
  showScreen('error-screen')
  const el = document.getElementById('error-message')
  if (el) el.textContent = message
}
