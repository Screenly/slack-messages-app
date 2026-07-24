import './css/style.css'
import '@screenly/edge-apps/components'
import {
  getSettingWithDefault,
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { setupSentry } from '@screenly/edge-apps/utils'
import { parseChannelId } from './content'
import { createCredentialManager } from './credentials'
import type { RefreshToken, RuntimeState } from './credentials'
import {
  fetchLatestAnnouncement,
  getChannelLink,
  toRenderableAnnouncement,
} from './messages'
import { renderAnnouncement, showScreen, showError } from './render'
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
  channelId: string,
  showQrCode: boolean,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken,
  displayErrors: boolean
): Promise<
  | ({
      accessToken: string
    } & Awaited<ReturnType<typeof fetchLatestAnnouncement>>)
  | null
> {
  try {
    await refreshToken()
    const { accessToken } = getRuntimeState()

    if (!accessToken) {
      handleError('No access token.', displayErrors)
      return null
    }

    const fetchResult = await fetchLatestAnnouncement(
      accessToken,
      channelId,
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
// error) still shows the error card. But if the channel simply came back
// empty (a legitimately empty channel), that's not an error - show a neutral
// empty state instead.
async function renderEmptyOrError(
  authError: boolean,
  hasFetchError: boolean,
  displayErrors: boolean,
  showSenderNames: boolean,
  showQrCode: boolean,
  accessToken: string,
  channelId: string
): Promise<void> {
  if (authError || hasFetchError) {
    handleError('No channel messages could be loaded.', displayErrors)
    return
  }

  // The main content already loaded successfully at this point (no auth
  // error, no fetch error) - the channel link is just for the QR code, so
  // treat any failure here (including a stray AuthError) as best-effort and
  // fall back to no QR code rather than derailing an otherwise-fine render.
  const channelLink = showQrCode
    ? await getChannelLink(accessToken, channelId).catch(() => null)
    : null

  renderAnnouncement(null, showSenderNames, showQrCode, channelLink)
  showScreen('message-screen')
}

async function fetchAndRender(
  channelId: string,
  showSenderNames: boolean,
  showQrCode: boolean,
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

  const initialFetch = await fetchLatestAnnouncement(
    accessToken,
    channelId,
    showQrCode
  )
  let result = initialFetch.result
  let authError = initialFetch.authError
  let hasFetchError = initialFetch.hasFetchError

  if (authError) {
    const retryResult = await retryAfterAuthError(
      channelId,
      showQrCode,
      getRuntimeState,
      refreshToken,
      displayErrors
    )
    if (!retryResult) return
    ;({ accessToken, result, authError, hasFetchError } = retryResult)
  }

  if (!result) {
    await renderEmptyOrError(
      authError,
      hasFetchError,
      displayErrors,
      showSenderNames,
      showQrCode,
      accessToken,
      channelId
    )
    return
  }

  const announcement = await toRenderableAnnouncement(
    accessToken,
    result,
    showSenderNames,
    resolveSenderName
  )

  renderAnnouncement(announcement, showSenderNames, showQrCode)
  showScreen('message-screen')
}

document.addEventListener('DOMContentLoaded', async () => {
  setupErrorHandling()

  const rawChannelId = getSettingWithDefault<string>('channel_id', '')
  const displayErrors =
    getSettingWithDefault<string>('display_errors', 'false') === 'true'
  const refreshInterval = getSettingWithDefault<number>('refresh_interval', 60)
  const showSenderNames =
    getSettingWithDefault<string>('show_sender_names', 'true') === 'true'
  const showQrCode =
    getSettingWithDefault<string>('show_qr_code', 'true') === 'true'

  let channelId: string
  try {
    channelId = parseChannelId(rawChannelId)
  } catch (err) {
    showError(
      err instanceof Error
        ? err.message
        : 'Please configure Channel ID in settings.'
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
      channelId,
      showSenderNames,
      showQrCode,
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
