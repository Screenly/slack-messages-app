import './css/style.css'
import '@screenly/edge-apps/components'
import {
  getSettingWithDefault,
  initTokenRefreshLoop,
  setupErrorHandling,
  signalReady,
} from '@screenly/edge-apps'
import { reportError, setupSentry } from '@screenly/edge-apps/utils'
import { AuthError, getConversationHistory, getConversationInfo } from './api'
import { parseChannelIds } from './content'
import { createCredentialManager } from './credentials'
import type { RefreshToken, RuntimeState } from './credentials'
import { renderFeeds, showScreen, showError } from './render'
import { createSenderNameResolver } from './users'
import type { SenderNameResolver } from './users'
import type { ChannelFeed, RenderableChannelFeed } from './types'

setupSentry('slack-messages', {
  'slack-messages': { screenName: screenly.metadata.screen_name },
})

function handleError(message: string, displayErrors: boolean): void {
  if (displayErrors) throw new Error(message)
  showError(message)
}

async function fetchChannelFeed(
  accessToken: string,
  channelId: string,
  limit: number
): Promise<ChannelFeed> {
  const [channel, messages] = await Promise.all([
    getConversationInfo(accessToken, channelId),
    getConversationHistory(accessToken, channelId, limit),
  ])
  return { channel, messages }
}

async function fetchAllFeeds(
  accessToken: string,
  channelIds: string[],
  limit: number
): Promise<{ feeds: ChannelFeed[]; authError: boolean }> {
  const results = await Promise.allSettled(
    channelIds.map((channelId) =>
      fetchChannelFeed(accessToken, channelId, limit)
    )
  )

  const feeds: ChannelFeed[] = []
  let authError = false

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      feeds.push(result.value)
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

  return { feeds, authError }
}

async function toRenderableFeeds(
  accessToken: string,
  feeds: ChannelFeed[],
  showSenderNames: boolean,
  resolveSenderName: SenderNameResolver
): Promise<RenderableChannelFeed[]> {
  return Promise.all(
    feeds.map(async (feed) => ({
      channel: feed.channel,
      messages: await Promise.all(
        feed.messages.map(async (message) => ({
          ts: message.ts,
          text: message.text,
          senderName:
            showSenderNames && message.user
              ? await resolveSenderName(accessToken, message.user)
              : (message.username ?? message.user ?? 'Unknown'),
        }))
      ),
    }))
  )
}

async function fetchAndRender(
  channelIds: string[],
  limit: number,
  showSenderNames: boolean,
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

  const initialFetch = await fetchAllFeeds(accessToken, channelIds, limit)
  let feeds = initialFetch.feeds
  const authError = initialFetch.authError

  if (authError) {
    try {
      await refreshToken()
      ;({ accessToken } = getRuntimeState())

      if (!accessToken) {
        handleError('No access token.', displayErrors)
        return
      }

      ;({ feeds } = await fetchAllFeeds(accessToken, channelIds, limit))
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

  if (feeds.length === 0) {
    handleError('No channel messages could be loaded.', displayErrors)
    return
  }

  const renderableFeeds = await toRenderableFeeds(
    accessToken,
    feeds,
    showSenderNames,
    resolveSenderName
  )

  renderFeeds(renderableFeeds)
  showScreen('feed-screen')
}

document.addEventListener('DOMContentLoaded', async () => {
  setupErrorHandling()

  const rawChannelIds = getSettingWithDefault<string>('channel_ids', '')
  const displayErrors =
    getSettingWithDefault<string>('display_errors', 'false') === 'true'
  const messageLimit = getSettingWithDefault<number>('message_limit', 10)
  const refreshInterval = getSettingWithDefault<number>('refresh_interval', 60)
  const showSenderNames =
    getSettingWithDefault<string>('show_sender_names', 'true') === 'true'

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
      messageLimit,
      showSenderNames,
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
