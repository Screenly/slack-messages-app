import type { TemplateResult } from 'lit-html'
import type { RenderableAnnouncement } from '../types'
import { announcementLayoutTemplate } from './announcement-layout'
import { mainAnnouncementTemplate } from './main-announcement'

export function announcementCardTemplate(
  announcement: RenderableAnnouncement,
  showSenderName: boolean,
  showQrCode: boolean
): TemplateResult {
  return announcementLayoutTemplate(
    mainAnnouncementTemplate(announcement, showSenderName),
    showQrCode,
    announcement.permalink,
    'View this message on your phone'
  )
}
