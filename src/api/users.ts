import { createBoundedCache } from './cache'
import { getUserDisplayName } from './slack'

const MAX_CACHE_ENTRIES = 50

export type SenderNameResolver = (
  accessToken: string,
  userId: string
) => Promise<string>

const getCachedName = createBoundedCache<string>(MAX_CACHE_ENTRIES)

export const resolveSenderName: SenderNameResolver = (accessToken, userId) =>
  getCachedName(userId, () =>
    getUserDisplayName(accessToken, userId).catch(() => userId)
  )
