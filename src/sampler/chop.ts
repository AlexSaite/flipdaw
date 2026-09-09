/**
 * FlipDAW — sample chopping math (M6.2).
 * EQUAL cuts a sample into N even slices; LAZY (Koala-style) snaps each
 * boundary to the nearest zero crossing so chops don't click.
 */

import type { ChopMode } from './model';

export interface Chop {
  start: number;
  end: number;
}

/** Even split: pure arithmetic, no waveform needed. */
export function equalChops(durationSec: number, parts: number): Chop[] {
  const n = Math.max(1, Math.round(parts));
  if (n <= 1) return [{ start: 0, end: durationSec }];
  const step = durationSec / n;
  return Array.from({ length: n }, (_, i) => ({ start: i * step, end: (i + 1) * step }));
}

/** Scan outward from `tIdeal` for the nearest sign change (zero crossing). */
function nearestZero(
  channel: Float32Array | undefined,
  sampleRate: number | undefined,
  tIdeal: number,
): number {
  if (!channel || !sampleRate || channel.length < 2) return tIdeal;
  const center = tIdeal * sampleRate;
  const maxHop = Math.max(1, Math.round(sampleRate * 0.01));
  const cross = (idx: number): number | null => {
    if (idx < 0 || idx >= channel.length - 1) return null;
    const a = channel[idx];
    const b = channel[idx + 1];
    if (a === 0) return idx / sampleRate;
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const w = (0 - a) / (b - a); // interpolate between the two samples
      return (idx + w) / sampleRate;
    }
    return null;
  };
  const first = Math.max(0, Math.floor(center));
  for (let h = 0; h <= maxHop; h++) {
    const r = cross(first + h) ?? cross(first - h);
    if (r !== null) return r;
  }
  return tIdeal;
}

/**
 * Chops of a sample. `channel`/`sampleRate` are optional: LAZY needs the
 * waveform to snap to zero crossings; EQUAL just splits the duration.
 */
export function computeChops(
  durationSec: number,
  parts: number,
  mode: ChopMode,
  channel?: Float32Array,
  sampleRate?: number,
): Chop[] {
  if (mode === 'equal') return equalChops(durationSec, parts);
  const equal = equalChops(durationSec, parts);
  const snapped: Chop[] = equal.map((c) => ({
    start: nearestZero(channel, sampleRate, c.start),
    end: nearestZero(channel, sampleRate, c.end),
  }));
  for (let i = 0; i < snapped.length; i++) {
    if (snapped[i].start >= snapped[i].end) snapped[i] = equal[i];
  }
  if (snapped.length > 1) snapped[snapped.length - 1].end = durationSec;
  return snapped;
}