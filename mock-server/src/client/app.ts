import type { createIcons as CreateIconsFn } from 'lucide'

declare global {
  const Alpine: {
    data: <T extends object>(name: string, component: () => T) => void
  }
  const lucide: { createIcons: typeof CreateIconsFn }
}

interface TokenData {
  access_token: string
  refresh_token: string
}

interface TokenViewerData {
  copied: string | null
  tokens: TokenData
  copyToken(key: string): void
}

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons()
})

document.addEventListener('alpine:init', () => {
  Alpine.data('pageLayout', () => ({
    disconnectOpen: false,
    reconnectOpen: false,
  }))

  Alpine.data<TokenViewerData>('tokenViewer', () => ({
    copied: null,
    tokens: {
      access_token:
        document.getElementById('data-access-token')!.textContent ?? '',
      refresh_token:
        document.getElementById('data-refresh-token')?.textContent ?? '',
    },
    copyToken(key: string) {
      navigator.clipboard.writeText(
        this.tokens[`${key}_token` as keyof TokenData]
      )
      this.copied = key
    },
  }))
})
