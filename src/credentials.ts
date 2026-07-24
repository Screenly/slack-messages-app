import { getCredentials, getSettingWithDefault } from '@screenly/edge-apps'
import { reportError } from '@screenly/edge-apps/utils'
import { BackendServerError, shouldSkipBackendError } from './errors'
import {
  readCachedCredentials,
  writeCachedCredentials,
} from './persistent-cache'

export type RefreshToken = () => Promise<void>
export type RuntimeState = {
  accessToken: string | null
  credentialError: Error | null
}

async function fetchToken(): Promise<string | undefined> {
  try {
    const { token } = await getCredentials()
    return token
  } catch (err) {
    // A failure to even reach the credentials backend is transient by
    // nature, unlike an empty/missing token (thrown below), which indicates
    // a genuine configuration problem that a cached token wouldn't fix.
    throw new BackendServerError(
      `Slack credentials could not be reached (${err instanceof Error ? err.message : String(err)}).`
    )
  }
}

export function createCredentialManager(displayErrors: boolean): {
  refreshToken: RefreshToken
  getRuntimeState: () => RuntimeState
} {
  let accessToken: string | null =
    getSettingWithDefault('access_token', '') || null
  let credentialError: Error | null = null
  let hasReportedCredentialError = false

  const refreshToken = async () => {
    try {
      const token = await fetchToken()

      if (!token) {
        throw new Error('No access token available.')
      }

      accessToken = token
      credentialError = null
      hasReportedCredentialError = false
      writeCachedCredentials({ accessToken: token })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (!hasReportedCredentialError) {
        reportError(error, { source: 'slack-credentials' })
        hasReportedCredentialError = true
      }
      credentialError = error

      // Only consult the cache when there's no live token already in hand,
      // so a manager that has already recovered credentials (live or
      // cached) never overwrites them with a possibly-stale cache entry on
      // a later failed refresh.
      if (!accessToken && shouldSkipBackendError(error, displayErrors)) {
        const cached = readCachedCredentials()
        if (cached) accessToken = cached.accessToken
      }

      throw error
    }
  }

  return {
    refreshToken,
    getRuntimeState: () => ({ accessToken, credentialError }),
  }
}
