// Simple in-memory cache with TTL support
// For activities and suggestions caching

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every minute
    if (typeof window !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
  }

  set<T>(key: string, data: T, ttlMs: number = 300000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clear all entries matching a pattern
  clearPattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache stats
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Singleton instance
export const cache = new MemoryCache();

// Cache keys and TTLs
export const CACHE_KEYS = {
  activities: (date: string) => `activities:${date}`,
  suggestions: (date: string) => `suggestions:${date}`,
  worklogs: (date: string) => `worklogs:${date}`,
  tickets: () => 'tickets:all',
  dashboard: (days: number) => `dashboard:${days}`,
} as const;

export const CACHE_TTL = {
  activities: 5 * 60 * 1000,    // 5 minutes
  suggestions: 10 * 60 * 1000,  // 10 minutes
  worklogs: 2 * 60 * 1000,      // 2 minutes (changes frequently)
  tickets: 15 * 60 * 1000,      // 15 minutes
  dashboard: 5 * 60 * 1000,     // 5 minutes
} as const;

// Helper to get cached or fetch
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await fetcher();
  cache.set(key, data, ttl);
  return data;
}

// Invalidate cache for a specific date
export function invalidateDateCache(date: string): void {
  cache.delete(CACHE_KEYS.activities(date));
  cache.delete(CACHE_KEYS.suggestions(date));
  cache.delete(CACHE_KEYS.worklogs(date));
}

// Invalidate all caches
export function invalidateAllCache(): void {
  cache.clear();
}
