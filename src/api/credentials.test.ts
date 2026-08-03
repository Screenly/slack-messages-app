import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { setupScreenlyMock } from '@screenly/edge-apps/test'
import { getSettingWithDefault } from '@screenly/edge-apps'

const getCredentials = mock(async () => ({
  token: '',
  metadata: undefined as Record<string, unknown> | undefined,
}))
const readEdgeAppCache = mock(() => null as { accessToken: string } | null)
const writeEdgeAppCache = mock(() => {})

mock.module('@screenly/edge-apps', () => ({
  getCredentials,
  getSettingWithDefault,
  readEdgeAppCache,
  writeEdgeAppCache,
}))

// `credentials.ts` reads `access_token` at module load time, so the global
// `screenly` mock must exist before it's imported below.
setupScreenlyMock()

const reportError = mock(() => {})
mock.module('@screenly/edge-apps/utils', () => ({ reportError }))

const { refreshToken, getRuntimeState, resetCredentialsForTesting } =
  await import('./credentials')

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
  setupScreenlyMock()
  resetCredentialsForTesting()
  getCredentials.mockClear()
  reportError.mockClear()
  readEdgeAppCache.mockClear()
  readEdgeAppCache.mockReturnValue(null)
  writeEdgeAppCache.mockClear()
})

describe('refreshToken', () => {
  test('stores the access token on success', async () => {
    succeedOnce()
    await refreshToken()

    expect(getRuntimeState()).toEqual({
      accessToken: 'abc',
      credentialError: null,
    })
    expect(reportError).not.toHaveBeenCalled()
  })

  test('throws and reports when the backend responds without a token', async () => {
    await expect(refreshToken()).rejects.toThrow('No access token available.')
    expect(getRuntimeState().credentialError?.message).toBe(
      'No access token available.'
    )
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  test('reports only the first of repeated failures, then again after a success', async () => {
    failWith('network down')

    await expect(refreshToken()).rejects.toThrow('network down')
    await expect(refreshToken()).rejects.toThrow('network down')
    expect(reportError).toHaveBeenCalledTimes(1)

    succeedOnce()
    await refreshToken()

    failWith('boom')
    await refreshToken()
    expect(getRuntimeState().credentialError?.message).toContain('boom')
    expect(reportError).toHaveBeenCalledTimes(2)
  })

  test('does not reject a failure that occurs while a usable accessToken is still held', async () => {
    succeedOnce()
    await refreshToken()

    failWith('boom')
    await expect(refreshToken()).resolves.toBeUndefined()
    expect(getRuntimeState().accessToken).toBe('abc')
    expect(getRuntimeState().credentialError?.message).toContain('boom')
  })
})

describe('credential caching', () => {
  test('writes the fresh token to cache on a successful refresh', async () => {
    succeedOnce()
    await refreshToken()

    expect(writeEdgeAppCache).toHaveBeenCalledWith(
      'slack-messages-app:v1',
      'credentials',
      { accessToken: 'abc' }
    )
  })

  test('repopulates state from cache on a skippable backend outage, without throwing', async () => {
    readEdgeAppCache.mockReturnValue({ accessToken: 'cached-token' })
    failWith('network down')

    await refreshToken()

    expect(getRuntimeState().accessToken).toBe('cached-token')
  })

  test('does not consult the cache when display_errors is on', async () => {
    readEdgeAppCache.mockReturnValue({ accessToken: 'cached-token' })
    failWith('network down')
    setupScreenlyMock({}, { display_errors: true })

    await expect(refreshToken()).rejects.toThrow(/network down/)

    expect(readEdgeAppCache).not.toHaveBeenCalled()
    expect(getRuntimeState().accessToken).toBeNull()
  })

  test('falls back to the cache for an empty token too, since the skip decision ignores error type', async () => {
    readEdgeAppCache.mockReturnValue({ accessToken: 'cached-token' })
    getCredentials.mockImplementation(async () => ({
      token: '',
      metadata: undefined,
    }))

    await refreshToken()

    expect(readEdgeAppCache).toHaveBeenCalled()
    expect(getRuntimeState().accessToken).toBe('cached-token')
  })

  test('does not re-read the cache once state already has a token', async () => {
    readEdgeAppCache.mockReturnValue({ accessToken: 'cached-token' })
    failWith('network down')

    await refreshToken()
    expect(readEdgeAppCache).toHaveBeenCalledTimes(1)

    await refreshToken()
    expect(readEdgeAppCache).toHaveBeenCalledTimes(1)
  })
})
