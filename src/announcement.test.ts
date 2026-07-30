import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { RuntimeState } from './api/credentials'
import type { AppSettings } from './settings'

const fetchLatestAnnouncement = mock(async () => ({
  result: null,
  authError: false,
  hasFetchError: false,
  fetchError: null as Error | null,
}))
const getChannelLink = mock(async () => null as string | null)
const toRenderableAnnouncement = mock(async () => ({
  ts: '1',
  textSegments: [],
  senderName: 'Someone',
  channelName: 'general',
  permalink: null,
}))
mock.module('./api/messages', () => ({
  fetchLatestAnnouncement,
  getChannelLink,
  toRenderableAnnouncement,
}))

const readCachedContent = mock(() => null as { result: unknown } | null)
const writeCachedContent = mock(() => {})
mock.module('./api/persistent-cache', () => ({
  readCachedContent,
  writeCachedContent,
}))

const renderAnnouncement = mock(() => {})
mock.module('./templates', () => ({ renderAnnouncement }))

const { refreshAnnouncement } = await import('./announcement')
const { BackendServerError } = await import('./api/errors')

const settings: AppSettings = {
  channelId: 'C123',
  displayErrors: false,
  refreshInterval: 60,
  showSenderNames: true,
  showQrCode: true,
}

const tokenRuntimeState = (): RuntimeState => ({
  accessToken: 'token',
  credentialError: null,
})

const noopResolveSenderName = mock(async () => '')

beforeEach(() => {
  fetchLatestAnnouncement.mockReset()
  fetchLatestAnnouncement.mockResolvedValue({
    result: null,
    authError: false,
    hasFetchError: false,
    fetchError: null,
  })
  getChannelLink.mockClear()
  getChannelLink.mockResolvedValue(null)
  toRenderableAnnouncement.mockClear()
  readCachedContent.mockClear()
  readCachedContent.mockReturnValue(null)
  writeCachedContent.mockClear()
  renderAnnouncement.mockClear()
})

describe('refreshAnnouncement credentials', () => {
  test('throws the credential error when no token is available', async () => {
    const credentialError = new Error('Credentials unavailable.')
    const getRuntimeState = (): RuntimeState => ({
      accessToken: null,
      credentialError,
    })
    const refreshToken = mock(async () => {})

    await expect(
      refreshAnnouncement(
        settings,
        getRuntimeState,
        refreshToken,
        noopResolveSenderName
      )
    ).rejects.toBe(credentialError)
    expect(fetchLatestAnnouncement).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })

  test('does not throw or render when the credential error is a skippable backend outage', async () => {
    const credentialError = new BackendServerError('network down')
    const getRuntimeState = (): RuntimeState => ({
      accessToken: null,
      credentialError,
    })
    const refreshToken = mock(async () => {})

    await refreshAnnouncement(
      settings,
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(renderAnnouncement).not.toHaveBeenCalled()
  })

  test('renders the empty state when there is no message with the current token', async () => {
    const getRuntimeState = (): RuntimeState => ({
      accessToken: 'current-token',
      credentialError: null,
    })
    const refreshToken = mock(async () => {})

    await refreshAnnouncement(
      settings,
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(fetchLatestAnnouncement).toHaveBeenCalledWith(
      'current-token',
      'C123',
      true
    )
    expect(refreshToken).not.toHaveBeenCalled()
    expect(renderAnnouncement).toHaveBeenCalledWith(null, true, true, null)
  })
})

describe('refreshAnnouncement token refresh', () => {
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

    await refreshAnnouncement(
      settings,
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchLatestAnnouncement).toHaveBeenLastCalledWith(
      'fresh-token',
      'C123',
      true
    )
    expect(renderAnnouncement).toHaveBeenCalledWith(null, true, true, null)
  })
})

describe('refreshAnnouncement credential retry recovery', () => {
  test('proceeds to retry the fetch when a failed refresh still recovers a token from its own cache', async () => {
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

    await refreshAnnouncement(
      settings,
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(fetchLatestAnnouncement).toHaveBeenLastCalledWith(
      'cached-token',
      'C123',
      true
    )
    expect(renderAnnouncement).toHaveBeenCalledWith(null, true, true, null)
  })
})

describe('refreshAnnouncement credential retry with no recovery', () => {
  function makeGetRuntimeState() {
    let callCount = 0
    return (): RuntimeState => {
      callCount += 1
      return callCount === 1
        ? { accessToken: 'expired-token', credentialError: null }
        : { accessToken: null, credentialError: null }
    }
  }

  test('does not throw or render when a refresh fails with a skippable backend outage', async () => {
    const refreshToken = mock(async () => {
      throw new BackendServerError('network down')
    })
    fetchLatestAnnouncement.mockResolvedValueOnce({
      result: null,
      authError: true,
      hasFetchError: false,
      fetchError: null,
    })

    await refreshAnnouncement(
      settings,
      makeGetRuntimeState(),
      refreshToken,
      noopResolveSenderName
    )

    expect(renderAnnouncement).not.toHaveBeenCalled()
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

    await expect(
      refreshAnnouncement(
        settings,
        makeGetRuntimeState(),
        refreshToken,
        noopResolveSenderName
      )
    ).rejects.toBe(refreshError)
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })
})

describe('content caching on success', () => {
  test('writes the fetched result to cache, including a legitimately empty channel', async () => {
    await refreshAnnouncement(
      settings,
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(writeCachedContent).toHaveBeenCalledWith('C123', { result: null })
  })

  test('writes a real message to cache and renders it', async () => {
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

    await refreshAnnouncement(
      settings,
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(writeCachedContent).toHaveBeenCalledWith('C123', {
      result: message,
    })
    expect(toRenderableAnnouncement).toHaveBeenCalledWith(
      'token',
      message,
      true,
      noopResolveSenderName
    )
    expect(renderAnnouncement).toHaveBeenCalled()
  })
})

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

    await refreshAnnouncement(
      settings,
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(toRenderableAnnouncement).toHaveBeenCalledWith(
      'token',
      cachedMessage,
      true,
      noopResolveSenderName
    )
    expect(renderAnnouncement).toHaveBeenCalled()
  })

  test('does not throw or render when there is nothing cached', async () => {
    readCachedContent.mockReturnValue(null)
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError: new BackendServerError('down'),
    })

    await refreshAnnouncement(
      settings,
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(renderAnnouncement).not.toHaveBeenCalled()
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
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError: new BackendServerError('down'),
    })

    await expect(
      refreshAnnouncement(
        { ...settings, displayErrors: true },
        tokenRuntimeState,
        mock(async () => {}),
        noopResolveSenderName
      )
    ).rejects.toThrow('No channel messages could be loaded.')
    expect(readCachedContent).not.toHaveBeenCalled()
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })

  test('surfaces the error instead of using the cache for a non-backend error', async () => {
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      fetchError: new Error('some unrelated failure'),
    })

    await expect(
      refreshAnnouncement(
        settings,
        tokenRuntimeState,
        mock(async () => {}),
        noopResolveSenderName
      )
    ).rejects.toThrow('No channel messages could be loaded.')
    expect(readCachedContent).not.toHaveBeenCalled()
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })
})
