import { getSettingWithDefault } from '@screenly/edge-apps'
import { html, nothing, type TemplateResult } from 'lit-html'
import { DEFAULT_SHOW_QR_CODE } from '../constants'
import { qrPanelTemplate } from './qr-panel'

export function announcementLayoutTemplate(
  main: TemplateResult,
  link: string | null,
  captionSubtitle: string
): TemplateResult {
  const showQrCode = getSettingWithDefault('show_qr_code', DEFAULT_SHOW_QR_CODE)

  return html`
    <div
      class="announcement-card bg-white rounded-3xl shadow-[0_0.5rem_1.25rem_rgba(0,0,0,0.16)] flex flex-row portrait:flex-col max-w-[74rem] portrait:max-w-full w-full max-h-full overflow-hidden"
    >
      ${main}
      ${
        showQrCode && link
          ? html`
              <div
                class="announcement-divider flex-shrink-0 w-[0.0625rem] self-stretch bg-[rgba(0,0,0,0.08)] portrait:w-auto portrait:h-[0.0625rem] portrait:self-auto portrait:mx-14 portrait:my-0"
              ></div>
              ${qrPanelTemplate(link, captionSubtitle)}
            `
          : nothing
      }
    </div>
  `
}
