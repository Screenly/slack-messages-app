import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { RuntimeState } from './credentials'
import type { AppSettings } from './settings'

const fetchLatestAnnouncement = mock(async () => ({
  result: null,
  authError: false,
  hasFetchError: false,
  fetchError: null as Error | null,
}))

mock.module('./messages', () => ({ fetchLatestAnnouncement }))

const readCachedContent = mock(() => null as { result: unknown } | null)
const writeCachedContent = mock(() => {})
mock.module('./persistent-cache', () => ({
  readCachedContent,
  writeCachedContent,
}))

const { createAnnouncementLoader } = await import('./announcement-loader')
const { BackendServerError } = await import('./errors')

const settings: AppSettings = {
  channelId: 'C123',
  displayErrors: false,
  refreshInterval: 60,
  showSenderNames: true,
  showQrCode: true,
}

beforeEach(() => {
  fetchLatestAnnouncement.mockReset()
  fetchLatestAnnouncement.mockResolvedValue({
    result: null,
    authError: false,
    hasFetchError: false,
    fetchError: null,
  })
  readCachedContent.mockClear()
  readCachedContent.mockReturnValue(null)
  writeCachedContent.mockClear()
})

describe('createAnnouncementLoader', () => {
  test('returns the credential error when no token is available', async () => {
    const credentialError = new Error('Credentials unavailable.')
    const getRuntimeState = (): RuntimeState => ({
      accessToken: null,
      credentialError,
    })
    const refreshToken = mock(async () => {})

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      refreshToken
    )

    expect(await load()).toEqual({ error: credentialError })
    expect(fetchLatestAnnouncement).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
  })

  test('skips instead of erroring when no token is available and the credential error is a skippable backend outage', async () => {
    const credentialError = new BackendServerError('network down')
    const getRuntimeState = (): RuntimeState => ({
      accessToken: null,
      credentialError,
    })
    const refreshToken = mock(async () => {})

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      refreshToken
    )

    expect(await load()).toEqual({ skipped: true })
  })

  test('loads an announcement with the current token', async () => {
    const getRuntimeState = (): RuntimeState => ({
      accessToken: 'current-token',
      credentialError: null,
    })
    const refreshToken = mock(async () => {})

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      refreshToken
    )

    expect(await load()).toEqual({
      accessToken: 'current-token',
      result: null,
      authError: false,
      hasFetchError: false,
      fetchError: null,
    })
    expect(fetchLatestAnnouncement).toHaveBeenCalledWith(
      'current-token',
      'C123',
      true
    )
    expect(refreshToken).not.toHaveBeenCalled()
  })
})

describe('createAnnouncementLoader token refresh', () => {
  test('uses a fresh token when the current token is expired', async () => {
    let accessToken = 'expired-token'
    const getRuntimeState = (): RuntimeState => ({
      accessToken,
      credentialError: null,
    })
    const refreshToken = mock(async () => {
      accessToken = 'fresh-token'
    })
    fetchLatestAnnouncement
      .mockResolvedValueOnce({
        result: null,
        authError: true,
        hasFetchError: false,
        fetchError: null,
      })
      .mockResolvedValueOnce({
        result: null,
        authError: false,
        hasFetchError: false,
        fetchError: null,
      })

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      refreshToken
    )

    expect(await load()).toMatchObject({
      accessToken: 'fresh-token',
      authError: false,
    })
    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchLatestAnnouncement).toHaveBeenLastCalledWith(
      'fresh-token',
      'C123',
      true
    )
  })
})

describe('createAnnouncementLoader credential retry recovery', () => {
  test('proceeds to retry the fetch when a failed refresh still recovers a token from its own cache', async () => {
    // Simulates credentials.ts's own persistent-cache fallback: refreshToken()
    // rejects, but getRuntimeState() is already repopulated with a
    // cache-recovered token by the time the loader re-checks it.
    let accessToken: string | null = 'expired-token'
    const getRuntimeState = (): RuntimeState => ({
      accessToken,
      credentialError: null,
    })
    const refreshToken = mock(async () => {
      accessToken = 'cached-token'
      throw new BackendServerError('network down')
    })
    fetchLatestAnnouncement
      .mockResolvedValueOnce({
        result: null,
        authError: true,
        hasFetchError: false,
        fetchError: null,
      })
      .mockResolvedValueOnce({
        result: null,
        authError: false,
        hasFetchError: false,
        fetchError: null,
      })

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      refreshToken
    )

    expect(await load()).toMatchObject({ accessToken: 'cached-token' })
    expect(fetchLatestAnnouncement).toHaveBeenLastCalledWith(
      'cached-token',
      'C123',
      true
    )
  })
})

describe('createAnnouncementLoader credential retry with no recovery', () => {
  // The initial `getRuntimeState()` call (before the fetch attempt) reports
  // the soon-to-expire token; every call after the failed `refreshToken()`
  // simulates credentials.ts having found nothing in its own cache, leaving
  // the runtime state empty.
  function makeGetRuntimeState() {
    let callCount = 0
    return (): RuntimeState => {
      callCount += 1
      return callCount === 1
        ? { accessToken: 'expired-token', credentialError: null }
        : { accessToken: null, credentialError: null }
    }
  }

  test('skips instead of erroring when a refresh fails with a skippable backend outage', async () => {
    const refreshToken = mock(async () => {
      throw new BackendServerError('network down')
    })
    fetchLatestAnnouncement.mockResolvedValueOnce({
      result: null,
      authError: true,
      hasFetchError: false,
      fetchError: null,
    })

    const load = createAnnouncementLoader(
      settings,
      makeGetRuntimeState(),
      refreshToken
    )

    expect(await load()).toEqual({ skipped: true })
  })

  test('surfaces the error when a refresh fails with a non-backend error', async () => {
    const refreshError = new Error('Session expired. Please re-authenticate.')
    const refreshToken = mock(async () => {
      throw refreshError
    })
    fetchLatestAnnouncement.mockResolvedValueOnce({
      result: null,
      authError: true,
      hasFetchError: false,
      fetchError: null,
    })

    const load = createAnnouncementLoader(
      settings,
      makeGetRuntimeState(),
      refreshToken
    )

    expect(await load()).toEqual({ error: refreshError })
  })
})

describe('content caching on success', () => {
  test('writes the fetched result to cache, including a legitimately empty channel', async () => {
    const getRuntimeState = (): RuntimeState => ({
      accessToken: 'token',
      credentialError: null,
    })

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      mock(async () => {})
    )
    await load()

    expect(writeCachedContent).toHaveBeenCalledWith('C123', { result: null })
  })

  test('writes a real message to cache', async () => {
    const message = {
      message: { ts: '1', user: 'U1', username: null, text: 'hi' },
      permalink: null,
      channelName: 'general',
    }
    fetchLatestAnnouncement.mockResolvedValue({
      result: message,
      authError: false,
      hasFetchError: false,
      fetchError: null,
    })
    const getRuntimeState = (): RuntimeState => ({
      accessToken: 'token',
      credentialError: null,
    })

    const load = createAnnouncementLoader(
      settings,
      getRuntimeState,
      mock(async () => {})
    )
    await load()

    expect(writeCachedContent).toHaveBeenCalledWith('C123', {
      result: message,
    })
  })
})

function makeContentFailoverLoader() {
  const getRuntimeState = (): RuntimeState => ({
    accessToken: 'token',
    credentialError: null,
  })
  return createAnnouncementLoader(
    settings,
    getRuntimeState,
    mock(async () => {})
  )
}

describe('content failover on a skippable backend outage', () => {
  test('falls back to cached content when there is a cache hit', async () => {
    const cachedMessage = {
      message: { ts: '1', user: 'U1', username: null, text: 'cached' },
      permalink: null,
      channelName: 'general',
    }
    readCachedContent.mockReturnValue({ result: cachedMessage })
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError: new BackendServerError('down'),
    })

    const load = makeContentFailoverLoader()

    expect(await load()).toEqual({
      accessToken: 'token',
      result: cachedMessage,
      authError: false,
      hasFetchError: false,
      fetchError: null,
    })
  })

  test('skips instead of erroring when there is nothing cached', async () => {
    readCachedContent.mockReturnValue(null)
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError: new BackendServerError('down'),
    })

    const load = makeContentFailoverLoader()

    expect(await load()).toEqual({ skipped: true })
  })
})

describe('content failover does not apply', () => {
  test('surfaces the error instead of using the cache when display_errors is on', async () => {
    readCachedContent.mockReturnValue({
      result: {
        message: { ts: '1', user: null, username: 'bot', text: 'cached' },
        permalink: null,
        channelName: 'general',
      },
    })
    const fetchError = new BackendServerError('down')
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError,
    })

    const getRuntimeState = (): RuntimeState => ({
      accessToken: 'token',
      credentialError: null,
    })
    const load = createAnnouncementLoader(
      { ...settings, displayErrors: true },
      getRuntimeState,
      mock(async () => {})
    )

    expect(await load()).toEqual({
      accessToken: 'token',
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError,
    })
    expect(readCachedContent).not.toHaveBeenCalled()
  })

  test('surfaces the error instead of using the cache for a non-backend error', async () => {
    const fetchError = new Error('some unrelated failure')
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError,
    })

    const load = makeContentFailoverLoader()

    expect(await load()).toEqual({
      accessToken: 'token',
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError,
    })
    expect(readCachedContent).not.toHaveBeenCalled()
  })
})
