import { describe, it, expect, vi, afterEach } from 'vitest';
import { cn } from './utils';

describe('cn (className merge utility)', () => {
  it('should merge simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes via clsx', () => {
    expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible');
  });

  it('should handle object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('should handle array syntax', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('should merge conflicting Tailwind classes (twMerge)', () => {
    // twMerge should deduplicate conflicting utilities
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
    expect(cn(undefined, null, false)).toBe('');
  });

  it('should combine complex scenarios', () => {
    const result = cn(
      'flex items-center',
      'p-2',
      { 'bg-blue-500': true, 'bg-red-500': false },
      'p-4'  // should override p-2
    );
    expect(result).toBe('flex items-center bg-blue-500 p-4');
  });
});

describe('apiUrl', () => {
  const originalEnv = process.env.NEXT_PUBLIC_BASE_PATH;

  afterEach(() => {
    vi.resetModules();
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_BASE_PATH = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    }
  });

  it('should prepend base path to API path', async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/timetracker';
    const { apiUrl } = await import('./api');
    expect(apiUrl('/api/health')).toBe('/timetracker/api/health');
  });

  it('should use default /timetracker base path when env not set', async () => {
    // api.ts reads env at module load time, so we need a fresh import
    // The default in the source is '/timetracker'
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    const { apiUrl } = await import('./api');
    expect(apiUrl('/api/test')).toBe('/timetracker/api/test');
  });

  it('should handle empty path', async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/app';
    const { apiUrl } = await import('./api');
    expect(apiUrl('')).toBe('/app');
  });
});
