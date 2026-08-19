import './css/style.css'
import '@screenly/edge-apps/components'
import {
  getSettingWithDefault,
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { setupSentry } from '@screenly/edge-apps/utils'
import { getRuntimeState, refreshToken } from './api/credentials'
import { resolveSenderName } from './api/users'
import { refreshAnnouncement } from './announcement'
import { DEFAULT_REFRESH_INTERVAL_SECONDS } from './constants'
import { initLocalization } from './localization'

setupSentry('slack-messages', {
  'slack-messages': { screenName: screenly.metadata.screen_name },
})

async function startApplication(): Promise<void> {
  setupErrorHandling()
  await initLocalization()

  const update = () =>
    refreshAnnouncement(getRuntimeState, refreshToken, resolveSenderName)

  try {
    await refreshToken()
  } catch (error) {
    console.warn('Failed to fetch initial credentials:', error)
  }

  initTokenRefreshLoop(refreshToken)
  await update()
  signalReady()

  const refreshIntervalSeconds = getSettingWithDefault(
    'refresh_interval',
    DEFAULT_REFRESH_INTERVAL_SECONDS
  )

  setInterval(async () => {
    try {
      await update()
    } catch (error) {
      console.error('Refresh failed:', error)
    }
  }, refreshIntervalSeconds * 1000)
}

document.addEventListener('DOMContentLoaded', () => {
  void startApplication()
})
