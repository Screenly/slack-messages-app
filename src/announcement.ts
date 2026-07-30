import type { RuntimeState } from './api/credentials'
import { shouldSkipBackendError } from './api/errors'
import {
  fetchLatestAnnouncement,
  getChannelLink,
  toRenderableAnnouncement,
} from './api/messages'
import { readCachedContent, writeCachedContent } from './api/persistent-cache'
import type { SenderNameResolver } from './api/users'
import type { AppSettings } from './settings'
import { renderAnnouncement } from './templates'

type FetchResponse = Awaited<ReturnType<typeof fetchLatestAnnouncement>>

type AnnouncementLoad = FetchResponse & {
  accessToken: string
}

interface AnnouncementLoadError {
  error: Error
}

// Nothing to show and nothing to fall back to: leave the screen as-is
// rather than flashing an error for a hiccup.
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

// `credentials.ts` already tries its own persistent-cache fallback before
// this is reached, so by this point there's genuinely no token available.
function handleMissingCredentials(
  credentialError: Error | null,
  displayErrors: boolean
): AnnouncementLoadResult {
  const error = credentialError ?? new Error('No access token available.')
  return shouldSkipBackendError(error, displayErrors)
    ? { skipped: true }
    : { error }
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

  if (!shouldSkipBackendError(response.fetchError, displayErrors)) {
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
  settings: AppSettings,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken
): Promise<AnnouncementLoadResult> {
  const runtimeState = getRuntimeState()
  let { accessToken } = runtimeState
  if (!accessToken) {
    return handleMissingCredentials(
      runtimeState.credentialError,
      settings.displayErrors
    )
  }

  let response = await fetchLatestAnnouncement(
    accessToken,
    settings.channelId,
    settings.showQrCode
  )
  if (!response.authError) {
    return resolveContent(
      settings.channelId,
      accessToken,
      settings.displayErrors,
      response
    )
  }

  let refreshError: unknown = null
  try {
    await refreshToken()
  } catch (error) {
    refreshError = error
  }
  ;({ accessToken } = getRuntimeState())
  if (!accessToken) {
    // `refreshToken()` may still have recovered a token from its own
    // persistent-cache fallback despite rejecting (see credentials.ts),
    // in which case `accessToken` above would be populated and this
    // branch wouldn't run.
    return refreshError
      ? handleMissingCredentials(
          normalizeError(refreshError),
          settings.displayErrors
        )
      : { error: new Error('No access token.') }
  }

  response = await fetchLatestAnnouncement(
    accessToken,
    settings.channelId,
    settings.showQrCode
  )
  return resolveContent(
    settings.channelId,
    accessToken,
    settings.displayErrors,
    response
  )
}

function renderAnnouncementContainer(
  announcement: Parameters<typeof renderAnnouncement>[0],
  settings: AppSettings,
  channelLink: string | null = null
): void {
  renderAnnouncement(
    announcement,
    settings.showSenderNames,
    settings.showQrCode,
    channelLink
  )
}

async function getEmptyStateChannelLink(
  accessToken: string,
  settings: AppSettings
): Promise<string | null> {
  if (!settings.showQrCode) return null
  return getChannelLink(accessToken, settings.channelId).catch(() => null)
}

export async function refreshAnnouncement(
  settings: AppSettings,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken,
  resolveSenderName: SenderNameResolver
): Promise<void> {
  const load = await loadAnnouncement(settings, getRuntimeState, refreshToken)

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
      settings
    )
    renderAnnouncementContainer(null, settings, channelLink)
    return
  }

  const announcement = await toRenderableAnnouncement(
    load.accessToken,
    load.result,
    settings.showSenderNames,
    resolveSenderName
  )
  renderAnnouncementContainer(announcement, settings)
}
