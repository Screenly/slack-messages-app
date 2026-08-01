import type { FetchedMessage } from './messages'

const CACHE_PREFIX = 'slack-messages-app:v1:'

export interface CachedCredentials {
  accessToken: string
}

export interface CachedContent {
  result: FetchedMessage | null
}

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function readJSON<T>(key: string): T | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJSON(key: string, value: unknown): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage disabled or quota exceeded; failover simply has nothing cached.
  }
}

export function readCachedCredentials(): CachedCredentials | null {
  return readJSON<CachedCredentials>(`${CACHE_PREFIX}credentials`)
}

export function writeCachedCredentials(value: CachedCredentials): void {
  writeJSON(`${CACHE_PREFIX}credentials`, value)
}

function contentKey(channelId: string): string {
  return `${CACHE_PREFIX}content:${channelId}`
}

export function readCachedContent(channelId: string): CachedContent | null {
  return readJSON<CachedContent>(contentKey(channelId))
}

export function writeCachedContent(
  channelId: string,
  value: CachedContent
): void {
  writeJSON(contentKey(channelId), value)
}
