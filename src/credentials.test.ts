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

const readCachedCredentials = mock(() => null as { accessToken: string } | null)
const writeCachedCredentials = mock(() => {})
mock.module('./persistent-cache', () => ({
  readCachedCredentials,
  writeCachedCredentials,
}))

const { createCredentialManager } = await import('./credentials')
const { BackendServerError } = await import('./errors')

function makeManager(displayErrors = false) {
  return createCredentialManager(displayErrors)
}

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

beforeEach(() => {
  getCredentials.mockClear()
  reportError.mockClear()
  readCachedCredentials.mockClear()
  readCachedCredentials.mockReturnValue(null)
  writeCachedCredentials.mockClear()
})

describe('createCredentialManager', () => {
  test('stores the access token on success', async () => {
    succeedOnce()
    const { refreshToken, getRuntimeState } = makeManager()
    await refreshToken()

    expect(getRuntimeState()).toEqual({
      accessToken: 'abc',
      credentialError: null,
    })
    expect(reportError).not.toHaveBeenCalled()
  })

  test('throws and reports when the backend responds without a token', async () => {
    const { refreshToken, getRuntimeState } = makeManager()

    await expect(refreshToken()).rejects.toThrow('No access token available.')
    expect(getRuntimeState().credentialError?.message).toBe(
      'No access token available.'
    )
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  test('reports only the first of repeated failures, then again after a success', async () => {
    failWith('network down')
    const { refreshToken } = makeManager()

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

describe('credential caching', () => {
  test('writes the fresh token to cache on a successful refresh', async () => {
    succeedOnce()
    const { refreshToken } = makeManager()
    await refreshToken()

    expect(writeCachedCredentials).toHaveBeenCalledWith({
      accessToken: 'abc',
    })
  })

  test('repopulates state from cache on a skippable backend outage', async () => {
    readCachedCredentials.mockReturnValue({ accessToken: 'cached-token' })
    failWith('network down')
    const { refreshToken, getRuntimeState } = makeManager(false)

    await expect(refreshToken()).rejects.toBeInstanceOf(BackendServerError)

    expect(getRuntimeState().accessToken).toBe('cached-token')
  })

  test('does not consult the cache when display_errors is on', async () => {
    readCachedCredentials.mockReturnValue({ accessToken: 'cached-token' })
    failWith('network down')
    const { refreshToken, getRuntimeState } = makeManager(true)

    await expect(refreshToken()).rejects.toBeInstanceOf(BackendServerError)

    expect(readCachedCredentials).not.toHaveBeenCalled()
    expect(getRuntimeState().accessToken).toBeNull()
  })

  test('does not consult the cache for a non-backend error', async () => {
    readCachedCredentials.mockReturnValue({ accessToken: 'cached-token' })
    getCredentials.mockImplementation(async () => ({
      token: '',
      metadata: undefined,
    }))
    const { refreshToken, getRuntimeState } = makeManager(false)

    await expect(refreshToken()).rejects.toThrow('No access token available.')

    expect(readCachedCredentials).not.toHaveBeenCalled()
    expect(getRuntimeState().accessToken).toBeNull()
  })

  test('does not re-read the cache once state already has a token', async () => {
    readCachedCredentials.mockReturnValue({ accessToken: 'cached-token' })
    failWith('network down')
    const { refreshToken } = makeManager(false)

    await expect(refreshToken()).rejects.toBeInstanceOf(BackendServerError)
    expect(readCachedCredentials).toHaveBeenCalledTimes(1)

    await expect(refreshToken()).rejects.toBeInstanceOf(BackendServerError)
    expect(readCachedCredentials).toHaveBeenCalledTimes(1)
  })
})
