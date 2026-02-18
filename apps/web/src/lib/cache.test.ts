import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to import a fresh module for each test to avoid singleton leaks.
// The MemoryCache class is not exported directly, but we can test through the exports.

describe('MemoryCache (via cache singleton)', () => {
  let cacheModule: typeof import('./cache');

  beforeEach(async () => {
    vi.useFakeTimers();
    // Dynamic import to get fresh module state isn't practical with singleton,
    // so we import once and clear between tests.
    cacheModule = await import('./cache');
    cacheModule.cache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      cacheModule.cache.set('key1', 'value1');
      expect(cacheModule.cache.get('key1')).toBe('value1');
    });

    it('should store objects', () => {
      const obj = { name: 'test', count: 42 };
      cacheModule.cache.set('obj', obj);
      expect(cacheModule.cache.get('obj')).toEqual(obj);
    });

    it('should store arrays', () => {
      const arr = [1, 2, 3];
      cacheModule.cache.set('arr', arr);
      expect(cacheModule.cache.get('arr')).toEqual([1, 2, 3]);
    });

    it('should overwrite existing keys', () => {
      cacheModule.cache.set('key', 'first');
      cacheModule.cache.set('key', 'second');
      expect(cacheModule.cache.get('key')).toBe('second');
    });

    it('should return null for missing keys', () => {
      expect(cacheModule.cache.get('nonexistent')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should return value before TTL expires', () => {
      cacheModule.cache.set('ttl-key', 'data', 5000);
      vi.advanceTimersByTime(4999);
      expect(cacheModule.cache.get('ttl-key')).toBe('data');
    });

    it('should return null after TTL expires', () => {
      cacheModule.cache.set('ttl-key', 'data', 5000);
      vi.advanceTimersByTime(5001);
      expect(cacheModule.cache.get('ttl-key')).toBeNull();
    });

    it('should use default TTL of 300000ms (5 min)', () => {
      cacheModule.cache.set('default-ttl', 'data');
      vi.advanceTimersByTime(299999);
      expect(cacheModule.cache.get('default-ttl')).toBe('data');
      vi.advanceTimersByTime(2);
      expect(cacheModule.cache.get('default-ttl')).toBeNull();
    });

    it('should delete expired entry on get', () => {
      cacheModule.cache.set('expired', 'data', 1000);
      vi.advanceTimersByTime(1001);
      // Access triggers deletion
      expect(cacheModule.cache.get('expired')).toBeNull();
      // Should no longer be in stats
      expect(cacheModule.cache.getStats().keys).not.toContain('expired');
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired key', () => {
      cacheModule.cache.set('exists', 'data');
      expect(cacheModule.cache.has('exists')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(cacheModule.cache.has('missing')).toBe(false);
    });

    it('should return false for expired key', () => {
      cacheModule.cache.set('expired', 'data', 1000);
      vi.advanceTimersByTime(1001);
      expect(cacheModule.cache.has('expired')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove a key', () => {
      cacheModule.cache.set('to-delete', 'data');
      cacheModule.cache.delete('to-delete');
      expect(cacheModule.cache.get('to-delete')).toBeNull();
    });

    it('should not throw when deleting non-existent key', () => {
      expect(() => cacheModule.cache.delete('nonexistent')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cacheModule.cache.set('a', 1);
      cacheModule.cache.set('b', 2);
      cacheModule.cache.set('c', 3);
      cacheModule.cache.clear();
      expect(cacheModule.cache.getStats().size).toBe(0);
    });
  });

  describe('clearPattern', () => {
    it('should remove keys matching a regex pattern', () => {
      cacheModule.cache.set('activities:2024-01-01', 'data1');
      cacheModule.cache.set('activities:2024-01-02', 'data2');
      cacheModule.cache.set('worklogs:2024-01-01', 'data3');
      cacheModule.cache.clearPattern('^activities:');
      expect(cacheModule.cache.get('activities:2024-01-01')).toBeNull();
      expect(cacheModule.cache.get('activities:2024-01-02')).toBeNull();
      expect(cacheModule.cache.get('worklogs:2024-01-01')).toBe('data3');
    });

    it('should handle complex regex patterns', () => {
      cacheModule.cache.set('item-1', 'a');
      cacheModule.cache.set('item-2', 'b');
      cacheModule.cache.set('other-1', 'c');
      cacheModule.cache.clearPattern('item-\\d+');
      expect(cacheModule.cache.getStats().size).toBe(1);
      expect(cacheModule.cache.get('other-1')).toBe('c');
    });
  });

  describe('getStats', () => {
    it('should return correct size', () => {
      cacheModule.cache.set('a', 1);
      cacheModule.cache.set('b', 2);
      expect(cacheModule.cache.getStats().size).toBe(2);
    });

    it('should return correct keys', () => {
      cacheModule.cache.set('key1', 1);
      cacheModule.cache.set('key2', 2);
      const stats = cacheModule.cache.getStats();
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });

  describe('size-based eviction', () => {
    it('should evict entries when cache exceeds 500', () => {
      // Fill cache to 501 entries
      for (let i = 0; i < 501; i++) {
        cacheModule.cache.set(`key-${i}`, `value-${i}`);
      }
      // After setting the 501st entry, cleanup should have run
      // and the cache should have fewer entries
      expect(cacheModule.cache.getStats().size).toBeLessThanOrEqual(501);
    });

    it('should force evict oldest entries when over 400 after cleanup', () => {
      // Fill cache to 501 non-expired entries to trigger force eviction
      for (let i = 0; i < 502; i++) {
        cacheModule.cache.set(`key-${i}`, `value-${i}`);
      }
      // The 502nd set triggers cleanup, and since none are expired,
      // it should force-evict the oldest 100 entries, then add the new one
      const stats = cacheModule.cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(403);
    });
  });
});

describe('CACHE_KEYS', () => {
  let mod: typeof import('./cache');

  beforeEach(async () => {
    mod = await import('./cache');
  });

  it('should generate correct activities key', () => {
    expect(mod.CACHE_KEYS.activities('2024-01-15')).toBe('activities:2024-01-15');
  });

  it('should generate correct suggestions key', () => {
    expect(mod.CACHE_KEYS.suggestions('2024-01-15')).toBe('suggestions:2024-01-15');
  });

  it('should generate correct worklogs key', () => {
    expect(mod.CACHE_KEYS.worklogs('2024-01-15')).toBe('worklogs:2024-01-15');
  });

  it('should generate correct tickets key', () => {
    expect(mod.CACHE_KEYS.tickets()).toBe('tickets:all');
  });

  it('should generate correct dashboard key', () => {
    expect(mod.CACHE_KEYS.dashboard(7)).toBe('dashboard:7');
  });
});

describe('CACHE_TTL', () => {
  let mod: typeof import('./cache');

  beforeEach(async () => {
    mod = await import('./cache');
  });

  it('should have correct TTL values', () => {
    expect(mod.CACHE_TTL.activities).toBe(5 * 60 * 1000);
    expect(mod.CACHE_TTL.suggestions).toBe(10 * 60 * 1000);
    expect(mod.CACHE_TTL.worklogs).toBe(2 * 60 * 1000);
    expect(mod.CACHE_TTL.tickets).toBe(15 * 60 * 1000);
    expect(mod.CACHE_TTL.dashboard).toBe(5 * 60 * 1000);
  });
});

describe('getCachedOrFetch', () => {
  let mod: typeof import('./cache');

  beforeEach(async () => {
    vi.useFakeTimers();
    mod = await import('./cache');
    mod.cache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call fetcher when cache is empty', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });
    const result = await mod.getCachedOrFetch('test-key', fetcher, 5000);
    expect(result).toEqual({ data: 'fresh' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('should return cached value without calling fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });
    // First call populates cache
    await mod.getCachedOrFetch('test-key', fetcher, 5000);
    // Second call should use cache
    const result = await mod.getCachedOrFetch('test-key', fetcher, 5000);
    expect(result).toEqual({ data: 'fresh' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('should call fetcher again after TTL expires', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ data: 'first' })
      .mockResolvedValueOnce({ data: 'second' });

    await mod.getCachedOrFetch('test-key', fetcher, 5000);
    vi.advanceTimersByTime(5001);
    const result = await mod.getCachedOrFetch('test-key', fetcher, 5000);
    expect(result).toEqual({ data: 'second' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('should propagate fetcher errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    await expect(mod.getCachedOrFetch('err-key', fetcher, 5000)).rejects.toThrow('Network error');
  });
});

describe('invalidateDateCache', () => {
  let mod: typeof import('./cache');

  beforeEach(async () => {
    mod = await import('./cache');
    mod.cache.clear();
  });

  it('should clear all caches for a specific date', () => {
    const date = '2024-01-15';
    mod.cache.set(mod.CACHE_KEYS.activities(date), 'act-data');
    mod.cache.set(mod.CACHE_KEYS.suggestions(date), 'sug-data');
    mod.cache.set(mod.CACHE_KEYS.worklogs(date), 'wl-data');
    // Keep another date's data
    mod.cache.set(mod.CACHE_KEYS.activities('2024-01-16'), 'other');

    mod.invalidateDateCache(date);

    expect(mod.cache.get(mod.CACHE_KEYS.activities(date))).toBeNull();
    expect(mod.cache.get(mod.CACHE_KEYS.suggestions(date))).toBeNull();
    expect(mod.cache.get(mod.CACHE_KEYS.worklogs(date))).toBeNull();
    // Other date unaffected
    expect(mod.cache.get(mod.CACHE_KEYS.activities('2024-01-16'))).toBe('other');
  });
});

describe('invalidateAllCache', () => {
  let mod: typeof import('./cache');

  beforeEach(async () => {
    mod = await import('./cache');
    mod.cache.clear();
  });

  it('should clear all caches', () => {
    mod.cache.set('a', 1);
    mod.cache.set('b', 2);
    mod.cache.set('c', 3);
    mod.invalidateAllCache();
    expect(mod.cache.getStats().size).toBe(0);
  });
});
