export function createBoundedCache<T>(maxEntries: number) {
  const cache = new Map<string, Promise<T>>()

  return function getCached(key: string, fetch: () => Promise<T>): Promise<T> {
    const cached = cache.get(key)
    if (cached) return cached

    const promise = fetch().catch((err) => {
      cache.delete(key)
      throw err
    })

    if (cache.size >= maxEntries) {
      const oldestKey = cache.keys().next().value
      if (oldestKey !== undefined) cache.delete(oldestKey)
    }
    cache.set(key, promise)
    return promise
  }
}
