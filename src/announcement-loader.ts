import type { RefreshToken, RuntimeState } from './credentials'
import { fetchLatestAnnouncement } from './messages'
import type { AppSettings } from './settings'

export type AnnouncementLoad = Awaited<
  ReturnType<typeof fetchLatestAnnouncement>
> & {
  accessToken: string
}

export interface AnnouncementLoadError {
  error: Error
}

export type AnnouncementLoadResult = AnnouncementLoad | AnnouncementLoadError
export type AnnouncementLoader = () => Promise<AnnouncementLoadResult>

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Session expired. Please re-authenticate.')
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
      return {
        error:
          runtimeState.credentialError ??
          new Error('No access token available.'),
      }
    }

    let response = await fetchLatestAnnouncement(
      accessToken,
      settings.channelId,
      settings.showQrCode
    )
    if (!response.authError) return { accessToken, ...response }

    try {
      await refreshToken()
    } catch (error) {
      return { error: normalizeError(error) }
    }
    ;({ accessToken } = getRuntimeState())
    if (!accessToken) return { error: new Error('No access token.') }

    response = await fetchLatestAnnouncement(
      accessToken,
      settings.channelId,
      settings.showQrCode
    )
    return { accessToken, ...response }
  }
}
