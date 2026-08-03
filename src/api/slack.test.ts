import { describe, test, expect, mock, afterEach } from 'bun:test'

mock.module('@screenly/edge-apps', () => ({
  getCorsProxyUrl: () => 'https://cors-proxy.example.com',
}))

const { getConversationInfo, getWorkspaceUrl, AuthError } =
  await import('./slack')

const ACCESS_TOKEN = 'abc'
const CHANNEL_ID = 'C123'

const originalFetch = globalThis.fetch

function stubFetch(impl: () => Promise<unknown>) {
  const fetchMock = mock(impl)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function fakeResponse(status: number, body: unknown) {
  return stubFetch(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }))
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('getConversationInfo', () => {
  test('resolves with the parsed body on success', async () => {
    fakeResponse(200, {
      ok: true,
      channel: { id: CHANNEL_ID, name: 'general' },
    })

    const result = await getConversationInfo(ACCESS_TOKEN, CHANNEL_ID)
    expect(result).toEqual({ id: CHANNEL_ID, name: 'general' })
  })

  test('rejects with an error on a 5xx response', async () => {
    fakeResponse(503, {})

    await expect(getConversationInfo(ACCESS_TOKEN, CHANNEL_ID)).rejects.toThrow(
      /had a problem \(503\)/
    )
  })

  test('rejects with an error on a 429 response', async () => {
    fakeResponse(429, {})

    await expect(getConversationInfo(ACCESS_TOKEN, CHANNEL_ID)).rejects.toThrow(
      /had a problem \(429\)/
    )
  })

  test('rejects with an error when the network request itself fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(getConversationInfo(ACCESS_TOKEN, CHANNEL_ID)).rejects.toThrow(
      /could not be reached/
    )
  })

  test('rejects with AuthError on an invalid_auth response', async () => {
    fakeResponse(200, { ok: false, error: 'invalid_auth' })

    await expect(
      getConversationInfo(ACCESS_TOKEN, CHANNEL_ID)
    ).rejects.toBeInstanceOf(AuthError)
  })

  test('rejects with a generic error on other non-ok responses', async () => {
    fakeResponse(400, {})

    await expect(getConversationInfo(ACCESS_TOKEN, CHANNEL_ID)).rejects.toThrow(
      /Slack API error 400/
    )
  })
})

describe('getWorkspaceUrl', () => {
  test('rejects with an error when the network request itself fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(getWorkspaceUrl(ACCESS_TOKEN)).rejects.toThrow(
      /could not be reached/
    )
  })

  test('resolves with the workspace url on success', async () => {
    fakeResponse(200, { ok: true, url: 'https://myteam.slack.com/' })

    await expect(getWorkspaceUrl(ACCESS_TOKEN)).resolves.toBe(
      'https://myteam.slack.com/'
    )
  })
})
