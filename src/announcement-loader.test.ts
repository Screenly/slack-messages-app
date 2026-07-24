import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { RuntimeState } from './credentials'
import type { AppSettings } from './settings'

const fetchLatestAnnouncement = mock(async () => ({
  result: null,
  authError: false,
  hasFetchError: false,
}))

mock.module('./messages', () => ({ fetchLatestAnnouncement }))

const { createAnnouncementLoader } = await import('./announcement-loader')

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
  })
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
      })
      .mockResolvedValueOnce({
        result: null,
        authError: false,
        hasFetchError: false,
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
