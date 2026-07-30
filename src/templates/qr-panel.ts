import { html, type TemplateResult } from 'lit-html'
import { unsafeSVG } from 'lit-html/directives/unsafe-svg.js'
import qrcode from 'qrcode-generator'

export function qrPanelTemplate(
  link: string,
  captionSubtitle: string
): TemplateResult {
  const qr = qrcode(0, 'M')
  qr.addData(link)
  qr.make()

  return html`
    <div
      class="announcement-qr-panel flex-shrink-0 bg-[#e8e8ea] p-12 flex flex-col items-center justify-center gap-5 text-center portrait:flex-row portrait:justify-start portrait:text-left portrait:py-10 portrait:px-14 portrait:gap-9"
    >
      <div
        class="qr-code bg-white rounded-xl p-3 w-48 h-48 shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.12)] portrait:w-64 portrait:h-64"
      >
        ${unsafeSVG(qr.createSvgTag({ scalable: true }))}
      </div>
      <div class="qr-caption flex flex-col gap-[0.35rem] portrait:text-left">
        <div
          class="qr-caption-title text-[1.75rem] font-bold text-[#1a1a1a] portrait:text-[2rem]"
        >
          Scan to open in Slack
        </div>
        <div class="qr-caption-subtitle text-muted-subtitle">
          ${captionSubtitle}
        </div>
      </div>
    </div>
  `
}
