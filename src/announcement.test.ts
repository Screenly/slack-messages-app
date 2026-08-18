import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { setupScreenlyMock } from '@screenly/edge-apps/test'
import { getSettingWithDefault } from '@screenly/edge-apps'
import type { RuntimeState } from './api/credentials'

const fetchLatestAnnouncement = mock(async () => ({
  result: null,
  authError: false,
  hasFetchError: false,
  notInChannel: false,
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

const readEdgeAppCache = mock(() => null as { result: unknown } | null)
const writeEdgeAppCache = mock(() => {})
mock.module('@screenly/edge-apps', () => ({
  getSettingWithDefault,
  readEdgeAppCache,
  writeEdgeAppCache,
}))

const renderAnnouncement = mock(() => {})
mock.module('./templates', () => ({ renderAnnouncement }))

const { refreshAnnouncement } = await import('./announcement')

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
    notInChannel: false,
    fetchError: null,
  })
  getChannelLink.mockClear()
  getChannelLink.mockResolvedValue(null)
  toRenderableAnnouncement.mockClear()
  readEdgeAppCache.mockClear()
  readEdgeAppCache.mockReturnValue(null)
  writeEdgeAppCache.mockClear()
  renderAnnouncement.mockClear()

  setupScreenlyMock()
})

describe('refreshAnnouncement credentials', () => {
  test('throws the credential error when no token is available and display_errors is on', async () => {
    const credentialError = new Error('Credentials unavailable.')
    const getRuntimeState = (): RuntimeState => ({
      accessToken: null,
      credentialError,
    })
    const refreshToken = mock(async () => {})
    setupScreenlyMock({}, { display_errors: true })

    await expect(
      refreshAnnouncement(getRuntimeState, refreshToken, noopResolveSenderName)
    ).rejects.toBe(credentialError)
    expect(fetchLatestAnnouncement).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })

  test('does not throw or render when no token is available and display_errors is off, regardless of error type', async () => {
    const credentialError = new Error('network down')
    const getRuntimeState = (): RuntimeState => ({
      accessToken: null,
      credentialError,
    })
    const refreshToken = mock(async () => {})

    await refreshAnnouncement(
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
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(fetchLatestAnnouncement).toHaveBeenCalledWith('current-token')
    expect(refreshToken).not.toHaveBeenCalled()
    expect(renderAnnouncement).toHaveBeenCalledWith(null, null, false)
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
        notInChannel: false,
        fetchError: null,
      })
      .mockResolvedValueOnce({
        result: null,
        authError: false,
        hasFetchError: false,
        notInChannel: false,
        fetchError: null,
      })

    await refreshAnnouncement(
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(refreshToken).toHaveBeenCalledTimes(1)
    expect(fetchLatestAnnouncement).toHaveBeenLastCalledWith('fresh-token')
    expect(renderAnnouncement).toHaveBeenCalledWith(null, null, false)
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
      throw new Error('network down')
    })
    fetchLatestAnnouncement
      .mockResolvedValueOnce({
        result: null,
        authError: true,
        hasFetchError: false,
        notInChannel: false,
        fetchError: null,
      })
      .mockResolvedValueOnce({
        result: null,
        authError: false,
        hasFetchError: false,
        notInChannel: false,
        fetchError: null,
      })

    await refreshAnnouncement(
      getRuntimeState,
      refreshToken,
      noopResolveSenderName
    )

    expect(fetchLatestAnnouncement).toHaveBeenLastCalledWith('cached-token')
    expect(renderAnnouncement).toHaveBeenCalledWith(null, null, false)
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

  test('does not throw or render when a refresh fails and display_errors is off', async () => {
    const refreshToken = mock(async () => {
      throw new Error('network down')
    })
    fetchLatestAnnouncement.mockResolvedValueOnce({
      result: null,
      authError: true,
      hasFetchError: false,
      notInChannel: false,
      fetchError: null,
    })

    await refreshAnnouncement(
      makeGetRuntimeState(),
      refreshToken,
      noopResolveSenderName
    )

    expect(renderAnnouncement).not.toHaveBeenCalled()
  })

  test('surfaces the error when a refresh fails and display_errors is on', async () => {
    const refreshError = new Error('Session expired. Please re-authenticate.')
    const refreshToken = mock(async () => {
      throw refreshError
    })
    fetchLatestAnnouncement.mockResolvedValueOnce({
      result: null,
      authError: true,
      hasFetchError: false,
      notInChannel: false,
      fetchError: null,
    })
    setupScreenlyMock({}, { display_errors: true })

    await expect(
      refreshAnnouncement(
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
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(writeEdgeAppCache).toHaveBeenCalledWith(
      'slack-messages-app:v1',
      'content:',
      { result: null }
    )
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
      notInChannel: false,
      fetchError: null,
    })

    await refreshAnnouncement(
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(writeEdgeAppCache).toHaveBeenCalledWith(
      'slack-messages-app:v1',
      'content:',
      { result: message }
    )
    expect(toRenderableAnnouncement).toHaveBeenCalledWith(
      'token',
      message,
      noopResolveSenderName
    )
    expect(renderAnnouncement).toHaveBeenCalled()
  })
})

describe('content failover when display_errors is off', () => {
  test('falls back to cached content when there is a cache hit', async () => {
    const cachedMessage = {
      message: { ts: '1', user: 'U1', username: null, text: 'cached' },
      permalink: null,
      channelName: 'general',
    }
    readEdgeAppCache.mockReturnValue({ result: cachedMessage })
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      notInChannel: false,
      fetchError: new Error('down'),
    })

    await refreshAnnouncement(
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(toRenderableAnnouncement).toHaveBeenCalledWith(
      'token',
      cachedMessage,
      noopResolveSenderName
    )
    expect(renderAnnouncement).toHaveBeenCalled()
  })

  test('does not throw or render when there is nothing cached', async () => {
    readEdgeAppCache.mockReturnValue(null)
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      notInChannel: false,
      fetchError: new Error('down'),
    })

    await refreshAnnouncement(
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(renderAnnouncement).not.toHaveBeenCalled()
  })

  test('consults the cache for a non-backend error too, aborting silently since nothing is cached', async () => {
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      notInChannel: false,
      fetchError: new Error('some unrelated failure'),
    })

    await refreshAnnouncement(
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(readEdgeAppCache).toHaveBeenCalled()
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })
})

describe('content failover does not apply', () => {
  test('surfaces the error instead of using the cache when display_errors is on', async () => {
    readEdgeAppCache.mockReturnValue({
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
      notInChannel: false,
      fetchError: new Error('down'),
    })
    setupScreenlyMock({}, { display_errors: true })

    await expect(
      refreshAnnouncement(
        tokenRuntimeState,
        mock(async () => {}),
        noopResolveSenderName
      )
    ).rejects.toThrow('Failed to fetch channel messages.')
    expect(readEdgeAppCache).not.toHaveBeenCalled()
    expect(renderAnnouncement).not.toHaveBeenCalled()
  })
})

describe('not_in_channel always surfaces the invite card', () => {
  test('renders the invite card even when display_errors is off and nothing is cached', async () => {
    readEdgeAppCache.mockReturnValue(null)
    fetchLatestAnnouncement.mockResolvedValue({
      result: null,
      authError: false,
      hasFetchError: true,
      notInChannel: true,
      fetchError: null,
    })

    await refreshAnnouncement(
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(readEdgeAppCache).not.toHaveBeenCalled()
    expect(writeEdgeAppCache).not.toHaveBeenCalled()
    expect(renderAnnouncement).toHaveBeenCalledWith(null, null, true)
  })

  test('renders the invite card instead of falling back to cached content when display_errors is on', async () => {
    readEdgeAppCache.mockReturnValue({
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
      notInChannel: true,
      fetchError: null,
    })
    setupScreenlyMock({}, { display_errors: true })

    await refreshAnnouncement(
      tokenRuntimeState,
      mock(async () => {}),
      noopResolveSenderName
    )

    expect(readEdgeAppCache).not.toHaveBeenCalled()
    expect(renderAnnouncement).toHaveBeenCalledWith(null, null, true)
  })
})
