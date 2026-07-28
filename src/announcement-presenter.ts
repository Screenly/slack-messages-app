import type { AnnouncementLoadResult } from './announcement-loader'
import { getChannelLink, toRenderableAnnouncement } from './messages'
import { renderAnnouncement, showMessageScreen } from './render'
import type { AppSettings } from './settings'
import type { SenderNameResolver } from './users'

export type AnnouncementPresenter = (
  load: AnnouncementLoadResult
) => Promise<void>

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
  showMessageScreen()
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
    if ('skipped' in load) return

    if ('error' in load) {
      throw load.error
    }

    if (load.authError || load.hasFetchError) {
      throw new Error('No channel messages could be loaded.')
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
