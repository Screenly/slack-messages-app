import {
  getSettingWithDefault,
  readEdgeAppCache,
  writeEdgeAppCache,
} from '@screenly/edge-apps'
import type { RuntimeState } from './api/credentials'
import {
  fetchLatestAnnouncement,
  getChannelLink,
  toRenderableAnnouncement,
} from './api/messages'
import type { FetchedMessage } from './api/messages'
import type { SenderNameResolver } from './api/users'
import {
  CACHE_NAMESPACE,
  DEFAULT_DISPLAY_ERRORS,
  DEFAULT_SHOW_QR_CODE,
} from './constants'
import { renderAnnouncement } from './templates'

interface CachedContent {
  result: FetchedMessage | null
}

type FetchResponse = Awaited<ReturnType<typeof fetchLatestAnnouncement>>

type AnnouncementLoad = FetchResponse & {
  accessToken: string
}

interface AnnouncementLoadSkipped {
  skipped: true
}

type AnnouncementLoadResult = AnnouncementLoad | AnnouncementLoadSkipped
export type RefreshToken = () => Promise<void>

function handleMissingCredentials(
  credentialError: Error | null
): AnnouncementLoadSkipped {
  const displayErrors = getSettingWithDefault(
    'display_errors',
    DEFAULT_DISPLAY_ERRORS
  )
  if (!displayErrors) return { skipped: true }
  throw credentialError ?? new Error('No access token available.')
}

function resolveContent(
  accessToken: string,
  response: FetchResponse
): AnnouncementLoadResult {
  const displayErrors = getSettingWithDefault(
    'display_errors',
    DEFAULT_DISPLAY_ERRORS
  )
  const channelId = getSettingWithDefault('channel_id', '')
  const cacheKey = `content:${channelId}`

  if (response.notInChannel) {
    return { accessToken, ...response }
  }

  if (!response.hasFetchError) {
    writeEdgeAppCache(CACHE_NAMESPACE, cacheKey, { result: response.result })
    return { accessToken, ...response }
  }

  if (displayErrors) {
    return { accessToken, ...response }
  }

  const cached = readEdgeAppCache<CachedContent>(CACHE_NAMESPACE, cacheKey)
  if (!cached) return { skipped: true }

  return {
    accessToken,
    result: cached.result,
    authError: false,
    hasFetchError: false,
    notInChannel: false,
    fetchError: null,
  }
}

async function loadAnnouncement(
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken
): Promise<AnnouncementLoadResult> {
  const runtimeState = getRuntimeState()
  let { accessToken } = runtimeState
  if (!accessToken) {
    return handleMissingCredentials(runtimeState.credentialError)
  }

  let response = await fetchLatestAnnouncement(accessToken)
  if (!response.authError) {
    return resolveContent(accessToken, response)
  }

  let refreshError: unknown = null
  try {
    await refreshToken()
  } catch (error) {
    refreshError = error
  }

  accessToken = getRuntimeState().accessToken
  if (accessToken) {
    response = await fetchLatestAnnouncement(accessToken)
    return resolveContent(accessToken, response)
  }

  if (!refreshError) throw new Error('No access token.')
  return handleMissingCredentials(
    refreshError instanceof Error
      ? refreshError
      : new Error('Session expired. Please re-authenticate.')
  )
}

function renderAnnouncementContainer(
  announcement: Parameters<typeof renderAnnouncement>[0],
  channelLink: string | null = null,
  needsInvite = false
): void {
  renderAnnouncement(announcement, channelLink, needsInvite)
}

async function getEmptyStateChannelLink(
  accessToken: string
): Promise<string | null> {
  const showQrCode = getSettingWithDefault('show_qr_code', DEFAULT_SHOW_QR_CODE)
  if (!showQrCode) return null
  return getChannelLink(accessToken).catch(() => null)
}

export async function refreshAnnouncement(
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken,
  resolveSenderName: SenderNameResolver
): Promise<void> {
  const load = await loadAnnouncement(getRuntimeState, refreshToken)

  if ('skipped' in load) return

  if (load.authError) {
    throw new Error('Slack authentication failed.')
  }

  if (load.notInChannel) {
    const channelLink = await getEmptyStateChannelLink(load.accessToken)
    renderAnnouncementContainer(null, channelLink, true)
    return
  }

  if (load.hasFetchError) {
    throw new Error('Failed to fetch channel messages.')
  }

  if (!load.result) {
    const channelLink = await getEmptyStateChannelLink(load.accessToken)
    renderAnnouncementContainer(null, channelLink)
    return
  }

  const announcement = await toRenderableAnnouncement(
    load.accessToken,
    load.result,
    resolveSenderName
  )
  renderAnnouncementContainer(announcement)
}
