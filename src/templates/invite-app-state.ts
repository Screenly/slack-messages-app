import { html, type TemplateResult } from 'lit-html'
import { announcementLayoutTemplate } from './announcement-layout'

function inviteAppMainTemplate(): TemplateResult {
  return html`
    <div class="announcement-main empty-state-main justify-center gap-3">
      <div class="announcement-text">Add Screenly to this channel</div>
      <div class="empty-state-subtitle text-muted-subtitle">
        Type <code>/invite</code> in the channel, choose "Add agents and apps to
        this channel", then search for and add Screenly
      </div>
    </div>
  `
}

export function inviteAppCardTemplate(
  channelLink: string | null
): TemplateResult {
  return announcementLayoutTemplate(
    inviteAppMainTemplate(),
    channelLink,
    'View this channel on your phone'
  )
}
