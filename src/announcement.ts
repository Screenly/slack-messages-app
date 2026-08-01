import { getSettingWithDefault } from '@screenly/edge-apps'
import type { RuntimeState } from './api/credentials'
import {
  fetchLatestAnnouncement,
  getChannelLink,
  toRenderableAnnouncement,
} from './api/messages'
import { readCachedContent, writeCachedContent } from './api/persistent-cache'
import type { SenderNameResolver } from './api/users'
import {
  DEFAULT_DISPLAY_ERRORS,
  DEFAULT_SHOW_QR_CODE,
  DEFAULT_SHOW_SENDER_NAMES,
} from './constants'
import { renderAnnouncement } from './templates'

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

export function parseChannelId(rawChannelId: string): string {
  const channelId = rawChannelId.trim()

  if (channelId.length === 0) {
    throw new Error('No Slack channel ID configured.')
  }

  return channelId
}

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Session expired. Please re-authenticate.')
}

// `credentials.ts` already tries its own persistent-cache fallback before
// this is reached, so by this point there's genuinely no token available.
function handleMissingCredentials(
  credentialError: Error | null,
  displayErrors: boolean
): AnnouncementLoadResult {
  if (!displayErrors) return { skipped: true }
  return { error: credentialError ?? new Error('No access token available.') }
}

function resolveContent(
  channelId: string,
  accessToken: string,
  displayErrors: boolean,
  response: FetchResponse
): AnnouncementLoadResult {
  if (!response.hasFetchError) {
    writeCachedContent(channelId, { result: response.result })
    return { accessToken, ...response }
  }

  if (displayErrors) {
    return { accessToken, ...response }
  }

  const cached = readCachedContent(channelId)
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
  channelId: string,
  displayErrors: boolean,
  showQrCode: boolean,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken
): Promise<AnnouncementLoadResult> {
  const runtimeState = getRuntimeState()
  let { accessToken } = runtimeState
  if (!accessToken) {
    return handleMissingCredentials(runtimeState.credentialError, displayErrors)
  }

  let response = await fetchLatestAnnouncement(
    accessToken,
    channelId,
    showQrCode
  )
  if (!response.authError) {
    return resolveContent(channelId, accessToken, displayErrors, response)
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

  response = await fetchLatestAnnouncement(accessToken, channelId, showQrCode)
  return resolveContent(channelId, accessToken, displayErrors, response)
}

function renderAnnouncementContainer(
  announcement: Parameters<typeof renderAnnouncement>[0],
  showSenderNames: boolean,
  showQrCode: boolean,
  channelLink: string | null = null
): void {
  renderAnnouncement(announcement, showSenderNames, showQrCode, channelLink)
}

async function getEmptyStateChannelLink(
  accessToken: string,
  channelId: string,
  showQrCode: boolean
): Promise<string | null> {
  if (!showQrCode) return null
  return getChannelLink(accessToken, channelId).catch(() => null)
}

export async function refreshAnnouncement(
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken,
  resolveSenderName: SenderNameResolver
): Promise<void> {
  const channelId = parseChannelId(getSettingWithDefault('channel_id', ''))
  const displayErrors = getSettingWithDefault(
    'display_errors',
    DEFAULT_DISPLAY_ERRORS
  )
  const showQrCode = getSettingWithDefault('show_qr_code', DEFAULT_SHOW_QR_CODE)
  const showSenderNames = getSettingWithDefault(
    'show_sender_names',
    DEFAULT_SHOW_SENDER_NAMES
  )

  const load = await loadAnnouncement(
    channelId,
    displayErrors,
    showQrCode,
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
    const channelLink = await getEmptyStateChannelLink(
      load.accessToken,
      channelId,
      showQrCode
    )
    renderAnnouncementContainer(null, showSenderNames, showQrCode, channelLink)
    return
  }

  const announcement = await toRenderableAnnouncement(
    load.accessToken,
    load.result,
    showSenderNames,
    resolveSenderName
  )
  renderAnnouncementContainer(announcement, showSenderNames, showQrCode)
}
