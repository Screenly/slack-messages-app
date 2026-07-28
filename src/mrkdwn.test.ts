import { describe, expect, mock, test } from 'bun:test'
import { parseMrkdwn } from './mrkdwn'

const resolveUser = mock(async (userId: string) => `user-${userId}`)
const resolveChannel = mock(async (channelId: string) => `channel-${channelId}`)

describe('parseMrkdwn', () => {
  test('preserves plain text', async () => {
    expect(
      await parseMrkdwn('Hello, Slack!', resolveUser, resolveChannel)
    ).toEqual([{ kind: 'text', value: 'Hello, Slack!' }])
  })

  test('resolves user and channel mentions', async () => {
    expect(
      await parseMrkdwn('Hello <@U123> in <#C123>', resolveUser, resolveChannel)
    ).toEqual([
      { kind: 'text', value: 'Hello ' },
      { kind: 'user-mention', value: '@user-U123' },
      { kind: 'text', value: ' in ' },
      { kind: 'channel-mention', value: '#channel-C123' },
    ])
  })

  test('uses inline channel names without resolving them', async () => {
    resolveChannel.mockClear()

    expect(
      await parseMrkdwn('<#C123|general>', resolveUser, resolveChannel)
    ).toEqual([{ kind: 'channel-mention', value: '#general' }])
    expect(resolveChannel).not.toHaveBeenCalled()
  })

  test('renders broadcasts and links as readable text', async () => {
    expect(
      await parseMrkdwn(
        '<!channel> see <https://example.com|the details>',
        resolveUser,
        resolveChannel
      )
    ).toEqual([
      { kind: 'text', value: '@channel' },
      { kind: 'text', value: ' see ' },
      { kind: 'text', value: 'the details' },
    ])
  })
})
