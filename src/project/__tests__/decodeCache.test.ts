import { describe, expect, it } from 'vitest';
import { DecodeCache } from '../decodeCache';

describe('DecodeCache', () => {
  it('decodes then serves from cache (same bytes = same hash)', async () => {
    const fake = new ArrayBuffer(4) as unknown as AudioBuffer;
    const ctx = { decodeAudioData: async () => fake } as unknown as BaseAudioContext;
    const cache = new DecodeCache(ctx);

    const b = new Uint8Array([1, 2, 3, 4]);
    const r1 = await cache.decode(b);
    const r2 = await cache.decode(b);
    expect(r1).toBe(r2); // cached
    expect(cache.peek(await cache.hashOf(b))).toBe(r1);
  });

  it('returns null on decode error', async () => {
    const ctx = { decodeAudioData: async () => { throw new Error('bad'); } } as unknown as BaseAudioContext;
    const cache = new DecodeCache(ctx);
    expect(await cache.decode(new Uint8Array([1]))).toBeNull();
  });

  it('evicts LRU beyond capacity (32) keeping most-recent', async () => {
    const ctx = { decodeAudioData: async (data: ArrayBuffer) => data.slice(0) as unknown as AudioBuffer } as unknown as BaseAudioContext;
    const cache = new DecodeCache(ctx);
    const all: Uint8Array[] = [];
    for (let i = 0; i < 40; i++) {
      const b = new Uint8Array(i + 1);
      all.push(b);
      await cache.decode(b);
    }
    // Last-created stays
    expect(cache.peek(await cache.hashOf(all[39]))).not.toBeNull();
    // First-created (oldest LRU) evicted
    expect(cache.peek(await cache.hashOf(all[0]))).toBeNull();
  });

  it('hashOf returns 64-char hex regardless of content', async () => {
    const cache = new DecodeCache({} as unknown as BaseAudioContext);
    const h = await cache.hashOf(new Uint8Array([1, 2, 3]));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('clear empties cache', async () => {
    const ctx = { decodeAudioData: async (data: ArrayBuffer) => data as unknown as AudioBuffer } as unknown as BaseAudioContext;
    const cache = new DecodeCache(ctx);
    const b = new Uint8Array([1, 2]);
    await cache.decode(b);
    const h = await cache.hashOf(b);
    expect(cache.peek(h)).not.toBeNull();
    cache.clear();
    expect(cache.peek(h)).toBeNull();
  });
});
