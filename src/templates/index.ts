import { render, type TemplateResult } from 'lit-html'
import type { RenderableAnnouncement } from '../types'
import { announcementCardTemplate } from './announcement-card'
import { emptyStateCardTemplate } from './empty-state'
import { inviteAppCardTemplate } from './invite-app-state'

export function renderAnnouncement(
  announcement: RenderableAnnouncement | null,
  channelLink: string | null = null,
  needsInvite = false
): void {
  const container = document.getElementById('announcement-container')
  if (!container) return

  let template: TemplateResult
  if (needsInvite) {
    template = inviteAppCardTemplate(channelLink)
  } else if (announcement) {
    template = announcementCardTemplate(announcement)
  } else {
    template = emptyStateCardTemplate(channelLink)
  }

  render(template, container)
  container.style.display = 'flex'
}
