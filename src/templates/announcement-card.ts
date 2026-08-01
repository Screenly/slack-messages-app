import type { TemplateResult } from 'lit-html'
import type { RenderableAnnouncement } from '../types'
import { announcementLayoutTemplate } from './announcement-layout'
import { mainAnnouncementTemplate } from './main-announcement'

export function announcementCardTemplate(
  announcement: RenderableAnnouncement
): TemplateResult {
  return announcementLayoutTemplate(
    mainAnnouncementTemplate(announcement),
    announcement.permalink,
    'View this message on your phone'
  )
}
