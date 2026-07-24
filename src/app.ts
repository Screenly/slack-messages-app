import './css/style.css'
import '@screenly/edge-apps/components'
import {
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { setupSentry } from '@screenly/edge-apps/utils'
import { createAnnouncementLoader } from './announcement-loader'
import { createAnnouncementPresenter } from './announcement-presenter'
import { createCredentialManager } from './credentials'
import { showError } from './render'
import { getAppSettings } from './settings'
import { createSenderNameResolver } from './users'

setupSentry('slack-messages', {
  'slack-messages': { screenName: screenly.metadata.screen_name },
})

function reportSettingsError(error: unknown): void {
  showError(
    error instanceof Error
      ? error.message
      : 'Please configure Channel ID in settings.'
  )
  signalReady()
}

function scheduleUpdates(update: () => Promise<void>, interval: number): void {
  setInterval(async () => {
    try {
      await update()
    } catch (error) {
      console.error('Refresh failed:', error)
    }
  }, interval * 1000)
}

export async function startApplication(): Promise<void> {
  setupErrorHandling()

  let settings
  try {
    settings = getAppSettings()
  } catch (error) {
    reportSettingsError(error)
    return
  }

  const { refreshToken, getRuntimeState } = createCredentialManager()
  const loadAnnouncement = createAnnouncementLoader(
    settings,
    getRuntimeState,
    refreshToken
  )
  const presentAnnouncement = createAnnouncementPresenter(
    settings,
    createSenderNameResolver()
  )
  const update = async () => presentAnnouncement(await loadAnnouncement())

  try {
    await refreshToken()
  } catch (error) {
    console.warn('Failed to fetch initial credentials:', error)
  }

  initTokenRefreshLoop(refreshToken)
  await update()
  signalReady()
  scheduleUpdates(update, settings.refreshInterval)
}
