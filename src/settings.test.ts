import { describe, expect, mock, test } from 'bun:test'

mock.module('@screenly/edge-apps', () => ({
  getSettingWithDefault: (_key: string, defaultValue: unknown) => defaultValue,
}))

const { parseChannelId } = await import('./settings')

describe('parseChannelId', () => {
  test('returns the channel id', () => {
    expect(parseChannelId('C0123ABCDEF')).toEqual('C0123ABCDEF')
  })

  test('trims whitespace around the id', () => {
    expect(parseChannelId(' C0123ABCDEF ')).toEqual('C0123ABCDEF')
  })

  test('throws when no channel id is configured', () => {
    expect(() => parseChannelId('')).toThrow('No Slack channel ID configured.')
  })

  test('throws when only whitespace is configured', () => {
    expect(() => parseChannelId('   ')).toThrow(
      'No Slack channel ID configured.'
    )
  })
})
