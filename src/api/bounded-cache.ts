export function createBoundedCache<T>(maxEntries: number) {
  const cache = new Map<string, Promise<T>>()

  return async function getCached(
    key: string,
    fetch: () => Promise<T>
  ): Promise<T> {
    const cached = cache.get(key)
    if (cached) return cached

    const promise = fetch()

    if (cache.size >= maxEntries) {
      const oldestKey = cache.keys().next().value
      if (oldestKey !== undefined) cache.delete(oldestKey)
    }
    cache.set(key, promise)

    try {
      return await promise
    } catch (err) {
      cache.delete(key)
      throw err
    }
  }
}
