import { render } from 'lit-html'
import type { RenderableAnnouncement } from '../types'
import { announcementCardTemplate } from './announcement-card'
import { emptyStateCardTemplate } from './empty-state'
import { inviteAppCardTemplate } from './invite-bot-state'

export function renderAnnouncement(
  announcement: RenderableAnnouncement | null,
  channelLink: string | null = null,
  needsInvite = false
): void {
  const container = document.getElementById('announcement-container')
  if (!container) return

  render(
    needsInvite
      ? inviteAppCardTemplate(channelLink)
      : announcement
        ? announcementCardTemplate(announcement)
        : emptyStateCardTemplate(channelLink),
    container
  )
  container.style.display = 'flex'
}
