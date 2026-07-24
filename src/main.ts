import './css/style.css'
import '@screenly/edge-apps/components'
import {
  getSettingWithDefault,
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { setupSentry } from '@screenly/edge-apps/utils'
import { parseChannelIds } from './content'
import { createCredentialManager } from './credentials'
import type { RefreshToken, RuntimeState } from './credentials'
import { fetchAllLatestMessages, toRenderableAnnouncements } from './messages'
import { renderAnnouncements, showScreen, showError } from './render'
import { createSenderNameResolver } from './users'
import type { SenderNameResolver } from './users'

setupSentry('slack-messages', {
  'slack-messages': { screenName: screenly.metadata.screen_name },
})

function handleError(message: string, displayErrors: boolean): void {
  if (displayErrors) throw new Error(message)
  showError(message)
}

async function retryAfterAuthError(
  channelIds: string[],
  showQrCode: boolean,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken,
  displayErrors: boolean
): Promise<
  | ({
      accessToken: string
    } & Awaited<ReturnType<typeof fetchAllLatestMessages>>)
  | null
> {
  try {
    await refreshToken()
    const { accessToken } = getRuntimeState()

    if (!accessToken) {
      handleError('No access token.', displayErrors)
      return null
    }

    const fetchResult = await fetchAllLatestMessages(
      accessToken,
      channelIds,
      showQrCode
    )
    return { accessToken, ...fetchResult }
  } catch (retryErr) {
    handleError(
      retryErr instanceof Error
        ? retryErr.message
        : 'Session expired. Please re-authenticate.',
      displayErrors
    )
    return null
  }
}

// A genuine failure (auth error surviving retry, or a real Slack/network
// error) still shows the error card. But if every channel simply came back
// empty (a legitimately empty channel), that's not an error - show a neutral
// empty state instead.
function renderEmptyOrError(
  authError: boolean,
  hasFetchError: boolean,
  displayErrors: boolean,
  showSenderNames: boolean,
  showQrCode: boolean,
  rotationSeconds: number
): void {
  if (authError || hasFetchError) {
    handleError('No channel messages could be loaded.', displayErrors)
    return
  }

  renderAnnouncements([], showSenderNames, showQrCode, rotationSeconds)
  showScreen('message-screen')
}

async function fetchAndRender(
  channelIds: string[],
  showSenderNames: boolean,
  showQrCode: boolean,
  rotationSeconds: number,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken,
  resolveSenderName: SenderNameResolver,
  displayErrors: boolean
): Promise<void> {
  let { accessToken } = getRuntimeState()
  const { credentialError } = getRuntimeState()

  if (!accessToken) {
    handleError(
      credentialError?.message ?? 'No access token available.',
      displayErrors
    )
    return
  }

  const initialFetch = await fetchAllLatestMessages(
    accessToken,
    channelIds,
    showQrCode
  )
  let results = initialFetch.results
  let authError = initialFetch.authError
  let hasFetchError = initialFetch.hasFetchError

  if (authError) {
    const retryResult = await retryAfterAuthError(
      channelIds,
      showQrCode,
      getRuntimeState,
      refreshToken,
      displayErrors
    )
    if (!retryResult) return
    ;({ accessToken, results, authError, hasFetchError } = retryResult)
  }

  if (results.length === 0) {
    renderEmptyOrError(
      authError,
      hasFetchError,
      displayErrors,
      showSenderNames,
      showQrCode,
      rotationSeconds
    )
    return
  }

  const announcements = await toRenderableAnnouncements(
    accessToken,
    results,
    showSenderNames,
    resolveSenderName
  )

  renderAnnouncements(
    announcements,
    showSenderNames,
    showQrCode,
    rotationSeconds
  )
  showScreen('message-screen')
}

document.addEventListener('DOMContentLoaded', async () => {
  setupErrorHandling()

  const rawChannelIds = getSettingWithDefault<string>('channel_ids', '')
  const displayErrors =
    getSettingWithDefault<string>('display_errors', 'false') === 'true'
  const refreshInterval = getSettingWithDefault<number>('refresh_interval', 60)
  const showSenderNames =
    getSettingWithDefault<string>('show_sender_names', 'true') === 'true'
  const showQrCode =
    getSettingWithDefault<string>('show_qr_code', 'true') === 'true'
  const rotationSeconds = getSettingWithDefault<number>(
    'message_display_duration',
    15
  )

  let channelIds: string[]
  try {
    channelIds = parseChannelIds(rawChannelIds)
  } catch (err) {
    showError(
      err instanceof Error
        ? err.message
        : 'Please configure Channel IDs in settings.'
    )
    signalReady()
    return
  }

  const { refreshToken, getRuntimeState } = createCredentialManager()
  const resolveSenderName = createSenderNameResolver()

  try {
    await refreshToken()
  } catch (err) {
    console.warn('Failed to fetch initial credentials:', err)
  }

  initTokenRefreshLoop(refreshToken)

  const run = () =>
    fetchAndRender(
      channelIds,
      showSenderNames,
      showQrCode,
      rotationSeconds,
      getRuntimeState,
      refreshToken,
      resolveSenderName,
      displayErrors
    )

  await run()
  signalReady()

  setInterval(async () => {
    try {
      await run()
    } catch (err) {
      console.error('Refresh failed:', err)
    }
  }, refreshInterval * 1000)
})
