import { getCredentials, getSettingWithDefault } from '@screenly/edge-apps'
import { reportError } from '@screenly/edge-apps/utils'
import { BackendServerError, shouldSkipBackendError } from './errors'
import {
  readCachedCredentials,
  writeCachedCredentials,
} from './persistent-cache'

export type RuntimeState = {
  accessToken: string | null
  credentialError: Error | null
}

function initialAccessToken(): string | null {
  return getSettingWithDefault('access_token', '') || null
}

let accessToken: string | null = initialAccessToken()
let credentialError: Error | null = null
let hasReportedCredentialError = false

async function fetchToken(): Promise<string | undefined> {
  try {
    const { token } = await getCredentials()
    return token
  } catch (err) {
    // Unreachable backend is transient, unlike an empty token (thrown
    // below), which is a genuine config problem a cache wouldn't fix.
    throw new BackendServerError(
      `Slack credentials could not be reached (${err instanceof Error ? err.message : String(err)}).`
    )
  }
}

export async function refreshToken(displayErrors: boolean): Promise<void> {
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

    // Only fall back to the cache if we don't already hold a token, so a
    // later failed refresh can't clobber good credentials with stale ones.
    if (!accessToken && shouldSkipBackendError(error, displayErrors)) {
      const cached = readCachedCredentials()
      if (cached) accessToken = cached.accessToken
    }

    throw error
  }
}

export function getRuntimeState(): RuntimeState {
  return { accessToken, credentialError }
}

export function resetCredentialsForTesting(): void {
  accessToken = initialAccessToken()
  credentialError = null
  hasReportedCredentialError = false
}
