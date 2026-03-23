
/*
    Copyright (c) 2012-2025 Jocelyn Turpault.
*/

export interface MemoizerStats {
  hits: number;
  misses: number;
  cacheSize: number;
}

export interface AsyncMemoizeFunction {
  <T>(keys: string[], data: () => Promise<T>, evict?: (value: T) => void): Promise<T>;
  stats: MemoizerStats;
  clear: () => void;
}

export interface SyncMemoizeFunction {
  <T>(keys: string[], data: () => T, evict?: (value: T) => void): T;
  stats: MemoizerStats;
  clear: () => void;
}

/**
 * Returns an async memoizer that caches Promise results. Use for async work.
 * The cache is scoped to the returned function (multiple memoizers have different caches).
 * @param maxCount - Maximum number of cached items (default: 5000)
 */
export function asyncMemoizer(maxCount = 5000): AsyncMemoizeFunction {
  const cache = new Map<string, Promise<unknown>>();
  const stats: MemoizerStats = { hits: 0, misses: 0, cacheSize: 0 };

  const res = function memoizeAsync<T>(
    keys: string[],
    data: () => Promise<T>,
    evict?: (value: T) => void
  ): Promise<T> {
    const k = keys.join(",");

    if (cache.has(k)) {
      const value = cache.get(k)!;
      cache.delete(k);
      cache.set(k, value);
      stats.hits++;
      stats.cacheSize = cache.size;
      return value as Promise<T>;
    }

    if (cache.size >= maxCount) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey && evict) {
        const oldValue = cache.get(oldestKey);
        if (oldValue) {
          oldValue.then(v => evict(v as T)).catch(() => { });
        }
      }
      cache.delete(oldestKey);
    }

    stats.misses++;
    const promise = data();
    cache.set(k, promise);
    stats.cacheSize = cache.size;

    return promise as Promise<T>;
  };

  res.stats = stats;
  res.clear = () => {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.cacheSize = 0;
  };

  return res as AsyncMemoizeFunction;
}

/**
 * Returns a sync memoizer that caches results of synchronous functions.
 * The cache is scoped to the returned function (multiple memoizers have different caches).
 * @param maxCount - Maximum number of cached items (default: 5000)
 */
export function memoizer(maxCount = 5000): SyncMemoizeFunction {
  const cache = new Map<string, unknown>();
  const stats: MemoizerStats = { hits: 0, misses: 0, cacheSize: 0 };

  const res = function memoizeSync<T>(
    keys: string[],
    data: () => T,
    evict?: (value: T) => void
  ): T {
    const k = keys.join(",");

    if (cache.has(k)) {
      const value = cache.get(k)!;
      cache.delete(k);
      cache.set(k, value);
      stats.hits++;
      stats.cacheSize = cache.size;
      return value as T;
    }

    if (cache.size >= maxCount) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey && evict) {
        evict(cache.get(oldestKey) as T);
      }
      cache.delete(oldestKey);
    }

    stats.misses++;
    const value = data();
    cache.set(k, value);
    stats.cacheSize = cache.size;

    return value;
  };

  res.stats = stats;
  res.clear = () => {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.cacheSize = 0;
  };

  return res as SyncMemoizeFunction;
}
