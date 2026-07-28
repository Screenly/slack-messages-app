import { describe, expect, test } from 'bun:test'
import { parseChannelId } from './content'

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
