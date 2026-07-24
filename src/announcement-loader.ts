import type { RefreshToken, RuntimeState } from './credentials'
import { shouldSkipBackendError } from './errors'
import { fetchLatestAnnouncement } from './messages'
import { readCachedContent, writeCachedContent } from './persistent-cache'
import type { AppSettings } from './settings'

type FetchResponse = Awaited<ReturnType<typeof fetchLatestAnnouncement>>

export type AnnouncementLoad = FetchResponse & {
  accessToken: string
}

export interface AnnouncementLoadError {
  error: Error
}

// Nothing to show and nothing to fall back to: the caller should leave the
// screen exactly as it is (see `announcement-presenter.ts`) rather than
// rendering an error, matching the "abort" step of the failover-caching
// flow - a transient, once-off hiccup shouldn't flash an error card.
export interface AnnouncementLoadSkipped {
  skipped: true
}

export type AnnouncementLoadResult =
  AnnouncementLoad | AnnouncementLoadError | AnnouncementLoadSkipped
export type AnnouncementLoader = () => Promise<AnnouncementLoadResult>

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Session expired. Please re-authenticate.')
}

// Decides what to do when there's no access token to work with: either
// because none has ever been fetched, or because a credential refresh just
// failed and left the runtime state empty (see `credentials.ts`, which
// already tries its own persistent-cache fallback before this is reached).
function handleMissingCredentials(
  credentialError: Error | null,
  displayErrors: boolean
): AnnouncementLoadResult {
  const error = credentialError ?? new Error('No access token available.')
  return shouldSkipBackendError(error, displayErrors)
    ? { skipped: true }
    : { error }
}

// On a successful fetch, refresh the persistent cache so a later failure
// has something fresh to fall back to. On a genuine fetch failure, fall
// back to the persistent cache when the failure is eligible for it (see
// `shouldSkipBackendError`); otherwise pass the failure through unchanged
// so the presenter shows it as-is.
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

export function createAnnouncementLoader(
  settings: AppSettings,
  getRuntimeState: () => RuntimeState,
  refreshToken: RefreshToken
): AnnouncementLoader {
  return async () => {
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
}
