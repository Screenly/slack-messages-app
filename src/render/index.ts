import qrcode from 'qrcode-generator'
import type { RenderableAnnouncement } from '../types'

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const DEFAULT_ROTATION_SECONDS = 15

let rotationTimer: ReturnType<typeof setInterval> | undefined

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

function createQrCodePanel(permalink: string): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'announcement-qr'

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
  caption.textContent = 'Scan to view on Slack'
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

  const content = document.createElement('div')
  content.className = 'announcement-content'

  if (showSenderName) {
    const sender = document.createElement('div')
    sender.className = 'announcement-sender'
    sender.textContent = announcement.senderName
    content.appendChild(sender)
  }

  const text = document.createElement('div')
  text.className = 'announcement-text'
  text.textContent = announcement.text
  content.appendChild(text)

  const time = document.createElement('div')
  time.className = 'announcement-time'
  time.textContent = formatTimestamp(announcement.ts)
  content.appendChild(time)

  card.appendChild(content)

  if (showQrCode && announcement.permalink) {
    card.appendChild(createQrCodePanel(announcement.permalink))
  }

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
  if (announcements.length === 0) return

  let index = 0
  const showCurrent = () => {
    screen.innerHTML = ''
    screen.appendChild(
      createAnnouncementCard(announcements[index], showSenderName, showQrCode)
    )
  }

  showCurrent()

  if (announcements.length > 1) {
    rotationTimer = setInterval(
      () => {
        index = (index + 1) % announcements.length
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
