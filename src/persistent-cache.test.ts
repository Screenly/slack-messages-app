import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  readCachedCredentials,
  writeCachedCredentials,
  readCachedContent,
  writeCachedContent,
} from './persistent-cache'

class FakeStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

const originalLocalStorage = globalThis.localStorage

function useFakeStorage(): FakeStorage {
  const storage = new FakeStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  })
  return storage
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    writable: true,
    configurable: true,
  })
})

describe('credentials cache', () => {
  beforeEach(() => {
    useFakeStorage()
  })

  test('round-trips read/write', () => {
    const value = { accessToken: 'abc' }
    writeCachedCredentials(value)

    expect(readCachedCredentials()).toEqual(value)
  })

  test('returns null when nothing is cached', () => {
    expect(readCachedCredentials()).toBeNull()
  })

  test('returns null on invalid JSON', () => {
    globalThis.localStorage.setItem(
      'slack-messages-app:v1:credentials',
      'not json'
    )

    expect(readCachedCredentials()).toBeNull()
  })
})

describe('content cache', () => {
  beforeEach(() => {
    useFakeStorage()
  })

  test('round-trips read/write for a message', () => {
    const value = {
      result: {
        message: { ts: '123', user: 'U1', username: null, text: 'hi' },
        permalink: 'https://example.slack.com/p123',
        channelName: 'general',
      },
    }
    writeCachedContent('C123', value)

    expect(readCachedContent('C123')).toEqual(value)
  })

  test('round-trips read/write for a legitimately empty channel', () => {
    writeCachedContent('C123', { result: null })

    expect(readCachedContent('C123')).toEqual({ result: null })
  })

  test('returns null when nothing is cached', () => {
    expect(readCachedContent('missing')).toBeNull()
  })

  test('returns null on invalid JSON', () => {
    globalThis.localStorage.setItem(
      'slack-messages-app:v1:content:C123',
      '{not valid json'
    )

    expect(readCachedContent('C123')).toBeNull()
  })

  test('does not collide across channels', () => {
    writeCachedContent('C1', { result: null })
    writeCachedContent('C2', {
      result: {
        message: { ts: '1', user: null, username: 'bot', text: 'hey' },
        permalink: null,
        channelName: 'random',
      },
    })

    expect(readCachedContent('C1')).toEqual({ result: null })
    expect(readCachedContent('C2')).toEqual({
      result: {
        message: { ts: '1', user: null, username: 'bot', text: 'hey' },
        permalink: null,
        channelName: 'random',
      },
    })
  })
})

describe('graceful degradation', () => {
  test('read/write are no-ops when localStorage is undefined', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    expect(() => writeCachedCredentials({ accessToken: 'a' })).not.toThrow()
    expect(readCachedCredentials()).toBeNull()
    expect(readCachedContent('C123')).toBeNull()
  })

  test('read/write are no-ops when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('storage disabled')
        },
        setItem: () => {
          throw new Error('quota exceeded')
        },
      },
      writable: true,
      configurable: true,
    })

    expect(() => writeCachedCredentials({ accessToken: 'a' })).not.toThrow()
    expect(readCachedCredentials()).toBeNull()
  })
})
