import type { AnnouncementLoadResult } from './announcement-loader'
import { getChannelLink, toRenderableAnnouncement } from './messages'
import { renderAnnouncement, showError, showScreen } from './render'
import type { AppSettings } from './settings'
import type { SenderNameResolver } from './users'

export type AnnouncementPresenter = (
  load: AnnouncementLoadResult
) => Promise<void>

function displayError(message: string, displayErrors: boolean): void {
  if (displayErrors) throw new Error(message)
  showError(message)
}

function displayMessage(
  announcement: Parameters<typeof renderAnnouncement>[0],
  settings: AppSettings,
  channelLink: string | null = null
): void {
  renderAnnouncement(
    announcement,
    settings.showSenderNames,
    settings.showQrCode,
    channelLink
  )
  showScreen('message-screen')
}

async function getEmptyStateLink(
  accessToken: string,
  settings: AppSettings
): Promise<string | null> {
  if (!settings.showQrCode) return null
  return getChannelLink(accessToken, settings.channelId).catch(() => null)
}

export function createAnnouncementPresenter(
  settings: AppSettings,
  resolveSenderName: SenderNameResolver
): AnnouncementPresenter {
  return async (load) => {
    if ('error' in load) {
      displayError(load.error.message, settings.displayErrors)
      return
    }

    if (load.authError || load.hasFetchError) {
      displayError(
        'No channel messages could be loaded.',
        settings.displayErrors
      )
      return
    }

    if (!load.result) {
      const channelLink = await getEmptyStateLink(load.accessToken, settings)
      displayMessage(null, settings, channelLink)
      return
    }

    const announcement = await toRenderableAnnouncement(
      load.accessToken,
      load.result,
      settings.showSenderNames,
      resolveSenderName
    )
    displayMessage(announcement, settings)
  }
}
