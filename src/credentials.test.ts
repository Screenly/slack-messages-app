import { describe, test, expect, beforeEach, mock } from 'bun:test'

const getCredentials = mock(async () => ({
  token: '',
  metadata: undefined as Record<string, unknown> | undefined,
}))

mock.module('@screenly/edge-apps', () => ({
  getCredentials,
  getSettingWithDefault: (_key: string, defaultValue: unknown) => defaultValue,
}))

const reportError = mock(() => {})
mock.module('@screenly/edge-apps/utils', () => ({ reportError }))

const { createCredentialManager } = await import('./credentials')

function succeedOnce() {
  getCredentials.mockImplementationOnce(async () => ({
    token: 'abc',
    metadata: undefined,
  }))
}

function failWith(message: string) {
  getCredentials.mockImplementation(async () => {
    throw new Error(message)
  })
}

describe('createCredentialManager', () => {
  beforeEach(() => {
    getCredentials.mockClear()
    reportError.mockClear()
  })

  test('stores the access token on success', async () => {
    succeedOnce()
    const { refreshToken, getRuntimeState } = createCredentialManager()
    await refreshToken()

    expect(getRuntimeState()).toEqual({
      accessToken: 'abc',
      credentialError: null,
    })
    expect(reportError).not.toHaveBeenCalled()
  })

  test('throws and reports when the backend responds without a token', async () => {
    const { refreshToken, getRuntimeState } = createCredentialManager()

    await expect(refreshToken()).rejects.toThrow('No access token available.')
    expect(getRuntimeState().credentialError?.message).toBe(
      'No access token available.'
    )
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  test('reports only the first of repeated failures, then again after a success', async () => {
    failWith('network down')
    const { refreshToken } = createCredentialManager()

    await expect(refreshToken()).rejects.toThrow('network down')
    await expect(refreshToken()).rejects.toThrow('network down')
    expect(reportError).toHaveBeenCalledTimes(1)

    succeedOnce()
    await refreshToken()

    failWith('boom')
    await expect(refreshToken()).rejects.toThrow('boom')
    expect(reportError).toHaveBeenCalledTimes(2)
  })
})
