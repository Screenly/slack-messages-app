import { getCredentials, getSettingWithDefault } from '@screenly/edge-apps'
import { reportError } from '@screenly/edge-apps/utils'

export type RefreshToken = () => Promise<void>
export type RuntimeState = {
  accessToken: string | null
  credentialError: Error | null
}

export function createCredentialManager(): {
  refreshToken: RefreshToken
  getRuntimeState: () => RuntimeState
} {
  let accessToken: string | null =
    getSettingWithDefault('access_token', '') || null
  let credentialError: Error | null = null
  let hasReportedCredentialError = false

  const refreshToken = async () => {
    try {
      const { token } = await getCredentials()

      if (!token) {
        throw new Error('No access token available.')
      }

      accessToken = token
      credentialError = null
      hasReportedCredentialError = false
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (!hasReportedCredentialError) {
        reportError(error, { source: 'slack-credentials' })
        hasReportedCredentialError = true
      }
      credentialError = error
      throw error
    }
  }

  return {
    refreshToken,
    getRuntimeState: () => ({ accessToken, credentialError }),
  }
}
