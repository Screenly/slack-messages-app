import { getUserDisplayName } from './api'

export type SenderNameResolver = (
  accessToken: string,
  userId: string
) => Promise<string>

export function createSenderNameResolver(): SenderNameResolver {
  const cache = new Map<string, Promise<string>>()

  return (accessToken, userId) => {
    const cached = cache.get(userId)
    if (cached) return cached

    const promise = getUserDisplayName(accessToken, userId).catch(() => userId)
    cache.set(userId, promise)
    return promise
  }
}
