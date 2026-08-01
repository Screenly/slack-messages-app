import { getCredentials, getSettingWithDefault } from '@screenly/edge-apps'
import { reportError } from '@screenly/edge-apps/utils'
import { CACHE_NAMESPACE } from '../constants'
import { readEdgeAppCache, writeEdgeAppCache } from './edge-app-cache'

export type RuntimeState = {
  accessToken: string | null
  credentialError: Error | null
}

interface CachedCredentials {
  accessToken: string
}

let accessToken: string | null = getSettingWithDefault('access_token', null)
let credentialError: Error | null = null

export async function refreshToken(): Promise<void> {
  try {
    const { token: freshAccessToken } = await getCredentials().catch(
      (err: unknown) => {
        throw new Error(
          `Slack credentials could not be reached (${err instanceof Error ? err.message : String(err)}).`,
          { cause: err }
        )
      }
    )

    if (!freshAccessToken) {
      throw new Error('No access token available.')
    }

    accessToken = freshAccessToken
    credentialError = null
    writeEdgeAppCache(CACHE_NAMESPACE, 'credentials', {
      accessToken: freshAccessToken,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    if (!credentialError) {
      reportError(error, { source: 'slack-credentials' })
    }
    credentialError = error

    // Only fall back to the cache if we don't already hold a token, so a
    // later failed refresh can't clobber good credentials with stale ones.
    const displayErrors = getSettingWithDefault('display_errors', false)
    if (!accessToken && !displayErrors) {
      const cached = readEdgeAppCache<CachedCredentials>(
        CACHE_NAMESPACE,
        'credentials'
      )
      if (cached) accessToken = cached.accessToken
    }

    if (!accessToken) {
      throw error
    }
  }
}

export function getRuntimeState(): RuntimeState {
  return { accessToken, credentialError }
}

export function resetCredentialsForTesting(): void {
  accessToken = getSettingWithDefault('access_token', null)
  credentialError = null
}
