import { describe, expect, test } from 'bun:test'
import { parseChannelIds } from './content'

describe('parseChannelIds', () => {
  test('parses a single channel id', () => {
    expect(parseChannelIds('C0123ABCDEF')).toEqual(['C0123ABCDEF'])
  })

  test('parses multiple comma-separated channel ids', () => {
    expect(parseChannelIds('C0123ABCDEF,C0456GHIJKL')).toEqual([
      'C0123ABCDEF',
      'C0456GHIJKL',
    ])
  })

  test('trims whitespace around ids', () => {
    expect(parseChannelIds(' C0123ABCDEF , C0456GHIJKL ')).toEqual([
      'C0123ABCDEF',
      'C0456GHIJKL',
    ])
  })

  test('drops empty entries from trailing commas', () => {
    expect(parseChannelIds('C0123ABCDEF,,')).toEqual(['C0123ABCDEF'])
  })

  test('dedupes repeated channel ids', () => {
    expect(parseChannelIds('C0123ABCDEF,C0123ABCDEF')).toEqual(['C0123ABCDEF'])
  })

  test('throws when no channel ids are configured', () => {
    expect(() => parseChannelIds('')).toThrow(
      'No Slack channel IDs configured.'
    )
  })

  test('throws when only whitespace or commas are configured', () => {
    expect(() => parseChannelIds(' , ,')).toThrow(
      'No Slack channel IDs configured.'
    )
  })
})
