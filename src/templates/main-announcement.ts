import { html, type TemplateResult } from 'lit-html'
import type { RenderableAnnouncement } from '../types'
import { announcementHeaderTemplate } from './announcement-header'
import { announcementTextTemplate } from './announcement-text'

export function mainAnnouncementTemplate(
  announcement: RenderableAnnouncement,
  showSenderName: boolean
): TemplateResult {
  return html`
    <div class="announcement-main gap-7">
      ${announcementHeaderTemplate(announcement, showSenderName)}
      ${announcementTextTemplate(announcement.textSegments)}
    </div>
  `
}
