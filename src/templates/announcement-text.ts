import { html, type TemplateResult } from 'lit-html'
import type { TextSegment } from '../types'

const SEGMENT_CLASS_NAMES: Record<TextSegment['kind'], string | null> = {
  text: null,
  'user-mention': 'mention-user',
  'channel-mention': 'mention-channel',
  link: 'mention-link',
}

function segmentTemplate(segment: TextSegment): TemplateResult | string {
  const className = SEGMENT_CLASS_NAMES[segment.kind]
  return className
    ? html`<span class="${className}">${segment.value}</span>`
    : segment.value
}

export function announcementTextTemplate(
  segments: TextSegment[]
): TemplateResult {
  // prettier-ignore
  return html`<div class="announcement-text">${segments.map(segmentTemplate)}</div>`
}
