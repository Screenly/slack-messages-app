import './css/style.css'
import '@screenly/edge-apps/components'
import {
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { setupSentry } from '@screenly/edge-apps/utils'
import { getRuntimeState, refreshToken } from './api/credentials'
import { resolveSenderName } from './api/users'
import { refreshAnnouncement } from './announcement'
import { getAppSettings } from './settings'

setupSentry('slack-messages', {
  'slack-messages': { screenName: screenly.metadata.screen_name },
})

async function startApplication(): Promise<void> {
  setupErrorHandling()

  const settings = getAppSettings()
  const refresh = () => refreshToken(settings.displayErrors)

  const update = () =>
    refreshAnnouncement(settings, getRuntimeState, refresh, resolveSenderName)

  try {
    await refresh()
  } catch (error) {
    console.warn('Failed to fetch initial credentials:', error)
  }

  initTokenRefreshLoop(refresh)
  await update()
  signalReady()

  setInterval(async () => {
    try {
      await update()
    } catch (error) {
      console.error('Refresh failed:', error)
    }
  }, settings.refreshInterval * 1000)
}

document.addEventListener('DOMContentLoaded', () => {
  void startApplication()
})
