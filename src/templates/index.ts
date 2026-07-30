import { render } from 'lit-html'
import type { RenderableAnnouncement } from '../types'
import { announcementCardTemplate } from './announcement-card'
import { emptyStateCardTemplate } from './empty-state'

export function renderAnnouncement(
  announcement: RenderableAnnouncement | null,
  showSenderName: boolean,
  showQrCode: boolean,
  channelLink: string | null = null
): void {
  const container = document.getElementById('announcement-container')
  if (!container) return

  render(
    announcement
      ? announcementCardTemplate(announcement, showSenderName, showQrCode)
      : emptyStateCardTemplate(showQrCode, channelLink),
    container
  )
  container.style.display = 'flex'
}
