/**
 * FlipDAW — decode cache (ADR-005 dedup: one copy per sha256).
 * sha256(file bytes) -> decoded AudioBuffer, LRU(32).
 */

const CACHE_SIZE = 32;

async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class DecodeCache {
  private readonly ctx: BaseAudioContext;
  private cache = new Map<string, AudioBuffer>();
  private hashes = new Map<string, string>(); // name -> hash (for dedup by path)

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  /** Decode + cache raw file bytes. Returns buffer or null on failure. */
  async decode(bytes: Uint8Array): Promise<AudioBuffer | null> {
    try {
      const hash = await sha256Hex(bytes);
      const hit = this.cache.get(hash);
      if (hit) { this.used(hash); return hit; }
      const buf = await this.ctx.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
      this.put(hash, buf);
      return buf;
    } catch {
      return null;
    }
  }

  /** sha256 of a file's bytes (for samples/<hash>.wav naming). */
  async hashOf(bytes: Uint8Array): Promise<string> {
    return sha256Hex(bytes);
  }

  /** Return an already-cached buffer by hash, else null. */
  peek(hash: string): AudioBuffer | null {
    return this.cache.get(hash) ?? null;
  }

  clear(): void { this.cache.clear(); }

  private put(hash: string, buf: AudioBuffer): void {
    if (this.cache.size >= CACHE_SIZE) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(hash, buf);
    this.hashes.set(buf.toString(), hash);
  }

  private used(hash: string): void {
    const buf = this.cache.get(hash);
    if (buf) { this.cache.delete(hash); this.cache.set(hash, buf); }
  }
}
