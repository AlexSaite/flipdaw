/**
 * FlipDAW — waveform thumbnails.
 * ComputePeaks: downsampled min/max per bucket (per channel).
 * Stored as thumbs/<hash>.json so a project opens without re-scanning audio.
 */

export interface Peaks {
  version: 1;
  length: number;   // number of buckets
  duration: number; // seconds
  channels: Float32Array[]; // each: interleaved [min, max, min, max, ...]
}

export const PEAKS_VERSION = 1 as const;
export const DEFAULT_BUCKETS = 800;

/** Downsample an AudioBuffer into per-bucket min/max. */
export function computePeaks(
  buf: AudioBuffer,
  buckets = DEFAULT_BUCKETS,
): Peaks {
  const n = Math.max(1, buckets);
  const ch: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    const out = new Float32Array(n * 2);
    const stride = Math.max(1, Math.floor(data.length / n));
    for (let b = 0; b < n; b++) {
      const start = b * stride;
      const end = Math.min(start + stride, data.length);
      let mn = 1, mx = -1;
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      out[b * 2] = mn;
      out[b * 2 + 1] = mx;
    }
    ch.push(out);
  }
  return { version: PEAKS_VERSION, length: n, duration: buf.duration, channels: ch };
}

export function peaksToJson(p: Peaks): string {
  return JSON.stringify({
    version: p.version,
    length: p.length,
    duration: p.duration,
    channels: p.channels.map((c) => [...c]),
  });
}

export function peaksFromJson(text: string): Peaks | null {
  try {
    const raw = JSON.parse(text) as {
      version?: number;
      length: number;
      duration: number;
      channels: number[][];
    };
    if (raw.version !== PEAKS_VERSION) return null;
    return {
      version: PEAKS_VERSION,
      length: raw.length,
      duration: raw.duration,
      channels: raw.channels.map((c) => Float32Array.from(c)),
    };
  } catch {
    return null;
  }
}

/** Draw peaks onto a 2D canvas. Mirror around center (waveform style). */
export function drawPeaks(
  ctx: CanvasRenderingContext2D,
  p: Peaks,
  width: number,
  height: number,
  color = '#14b8a6',
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const mid = height / 2;
  const mono = combineChannels(p);
  const step = Math.max(1, (p.length * 2) / width);
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    const i = Math.min(mono.length - 1, Math.floor(x * step));
    if (i >= mono.length) break;
    const mn = mono[i * 2];
    const mx = mono[i * 2 + 1];
    const y0 = mid + mn * mid;
    const y1 = mid + mx * mid;
    ctx.moveTo(x + 0.5, y0);
    ctx.lineTo(x + 0.5, y1);
  }
  ctx.stroke();
}

function combineChannels(p: Peaks): Float32Array {
  if (p.channels.length === 1) return p.channels[0];
  const out = new Float32Array(p.length * 2);
  for (let b = 0; b < p.length; b++) {
    let mn = 1, mx = -1;
    for (const ch of p.channels) {
      if (ch[b * 2] < mn) mn = ch[b * 2];
      if (ch[b * 2 + 1] > mx) mx = ch[b * 2 + 1];
    }
    out[b * 2] = mn;
    out[b * 2 + 1] = mx;
  }
  return out;
}
