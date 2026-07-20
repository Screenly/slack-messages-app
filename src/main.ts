import './css/style.css'
import '@screenly/edge-apps/components'
import {
  getSettingWithDefault,
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { reportError, setupSentry } from '@screenly/edge-apps/utils'
import { AuthError, getConversationHistory, getMessagePermalink } from './api'
import { parseChannelIds } from './content'
import { createCredentialManager } from './credentials'
import type { RefreshToken, RuntimeState } from './credentials'
import { renderAnnouncements, showScreen, showError } from './render'
import { createSenderNameResolver } from './users'
import type { SenderNameResolver } from './users'
import type { SlackMessage, RenderableAnnouncement } from './types'

const LATEST_MESSAGE_LIMIT = 1

setupSentry('slack-messages', {
  'slack-messages': { screenName: screenly.metadata.screen_name },
})

function handleError(message: string, displayErrors: boolean): void {
  if (displayErrors) throw new Error(message)
  showError(message)
}

async function fetchLatestMessage(
  accessToken: string,
  channelId: string
): Promise<{ message: SlackMessage; permalink: string | null } | null> {
  const messages = await getConversationHistory(
    accessToken,
    channelId,
    LATEST_MESSAGE_LIMIT
  )
  const message = messages[0]
  if (!message) return null

  let permalink: string | null = null
  try {
    permalink = await getMessagePermalink(accessToken, channelId, message.ts)
  } catch (err) {
    if (err instanceof AuthError) throw err
    reportError(err, { source: 'slack-permalink', channelId })
  }

  return { message, permalink }
}

async function fetchAllLatestMessages(
  accessToken: string,
  channelIds: string[]
): Promise<{
  results: { message: SlackMessage; permalink: string | null }[]
  authError: boolean
}> {
  const settled = await Promise.allSettled(
    channelIds.map((channelId) => fetchLatestMessage(accessToken, channelId))
  )

  const results: { message: SlackMessage; permalink: string | null }[] = []
  let authError = false

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value) results.push(result.value)
      return
    }

    if (result.reason instanceof AuthError) {
      authError = true
      return
    }

    reportError(result.reason, {
      source: 'slack-content',
      channelId: channelIds[index],
    })
  })

  return { results, authError }
}

async function toRenderableAnnouncements(
  accessToken: string,
  results: { message: SlackMessage; permalink: string | null }[],
  showSenderNames: boolean,
  resolveSenderName: SenderNameResolver
): Promise<RenderableAnnouncement[]> {
  return Promise.all(
    results.map(async ({ message, permalink }) => ({
      ts: message.ts,
      text: message.text,
      senderName:
        showSenderNames && message.user
          ? await resolveSenderName(accessToken, message.user)
          : (message.username ?? message.user ?? 'Unknown'),
      permalink,
    }))
  )
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

  const initialFetch = await fetchAllLatestMessages(accessToken, channelIds)
  let results = initialFetch.results
  const authError = initialFetch.authError

  if (authError) {
    try {
      await refreshToken()
      ;({ accessToken } = getRuntimeState())

      if (!accessToken) {
        handleError('No access token.', displayErrors)
        return
      }

      ;({ results } = await fetchAllLatestMessages(accessToken, channelIds))
    } catch (retryErr) {
      handleError(
        retryErr instanceof Error
          ? retryErr.message
          : 'Session expired. Please re-authenticate.',
        displayErrors
      )
      return
    }
  }

  if (results.length === 0) {
    handleError('No channel messages could be loaded.', displayErrors)
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
