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

interface AnnouncementLoadError {
  error: Error
}

interface AnnouncementLoadSkipped {
  skipped: true
}

type AnnouncementLoadResult =
  AnnouncementLoad | AnnouncementLoadError | AnnouncementLoadSkipped
export type RefreshToken = () => Promise<void>

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Session expired. Please re-authenticate.')
}

function handleMissingCredentials(
  credentialError: Error | null,
  displayErrors: boolean
): AnnouncementLoadResult {
  if (!displayErrors) return { skipped: true }
  return { error: credentialError ?? new Error('No access token available.') }
}

function resolveContent(
  accessToken: string,
  displayErrors: boolean,
  response: FetchResponse
): AnnouncementLoadResult {
  const channelId = getSettingWithDefault('channel_id', '')
  const cacheKey = `content:${channelId}`

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
    fetchError: null,
  }
}

async function loadAnnouncement(
  displayErrors: boolean,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken
): Promise<AnnouncementLoadResult> {
  const runtimeState = getRuntimeState()
  let { accessToken } = runtimeState
  if (!accessToken) {
    return handleMissingCredentials(runtimeState.credentialError, displayErrors)
  }

  let response = await fetchLatestAnnouncement(accessToken)
  if (!response.authError) {
    return resolveContent(accessToken, displayErrors, response)
  }

  let refreshError: unknown = null
  try {
    await refreshToken()
  } catch (error) {
    refreshError = error
  }
  ;({ accessToken } = getRuntimeState())
  if (!accessToken) {
    return refreshError
      ? handleMissingCredentials(normalizeError(refreshError), displayErrors)
      : { error: new Error('No access token.') }
  }

  response = await fetchLatestAnnouncement(accessToken)
  return resolveContent(accessToken, displayErrors, response)
}

function renderAnnouncementContainer(
  announcement: Parameters<typeof renderAnnouncement>[0],
  channelLink: string | null = null
): void {
  renderAnnouncement(announcement, channelLink)
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
  const displayErrors = getSettingWithDefault(
    'display_errors',
    DEFAULT_DISPLAY_ERRORS
  )

  const load = await loadAnnouncement(
    displayErrors,
    getRuntimeState,
    refreshToken
  )

  if ('skipped' in load) return

  if ('error' in load) {
    throw load.error
  }

  if (load.authError || load.hasFetchError) {
    throw new Error('No channel messages could be loaded.')
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
