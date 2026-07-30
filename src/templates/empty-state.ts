import { html, type TemplateResult } from 'lit-html'
import { announcementLayoutTemplate } from './announcement-layout'

function emptyStateMainTemplate(): TemplateResult {
  return html`
    <div class="announcement-main empty-state-main justify-center gap-3">
      <div class="announcement-text">No new messages yet</div>
      <div class="empty-state-subtitle text-muted-subtitle">
        New messages will appear here on the next refresh
      </div>
    </div>
  `
}

export function emptyStateCardTemplate(
  showQrCode: boolean,
  channelLink: string | null
): TemplateResult {
  return announcementLayoutTemplate(
    emptyStateMainTemplate(),
    showQrCode,
    channelLink,
    'View this channel on your phone'
  )
}
