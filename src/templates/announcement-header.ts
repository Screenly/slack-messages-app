import { html, nothing, type TemplateResult } from 'lit-html'
import type { RenderableAnnouncement } from '../types'

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

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

export function announcementHeaderTemplate(
  announcement: RenderableAnnouncement,
  showSenderName: boolean
): TemplateResult {
  const subline = [
    announcement.channelName && `#${announcement.channelName}`,
    formatTimestamp(announcement.ts),
  ]
    .filter(Boolean)
    .join(' · ')

  return html`
    <div class="announcement-header flex items-center gap-[1.125rem]">
      ${
        showSenderName
          ? html`<div
              class="announcement-avatar flex-shrink-0 w-[4.5rem] h-[4.5rem] rounded-full bg-[#4a154b] text-white flex items-center justify-center font-bold text-[1.65rem]"
            >
              ${getInitials(announcement.senderName)}
            </div>`
          : nothing
      }
      <div class="announcement-meta min-w-0">
        ${
          showSenderName
            ? html`<div
                class="announcement-sender text-[2.1rem] font-bold leading-[1.3] text-[#1a1a1a]"
              >
                ${announcement.senderName}
              </div>`
            : nothing
        }
        <div class="announcement-subline text-[1.35rem] text-[#6b6b70]">
          ${subline}
        </div>
      </div>
    </div>
  `
}
