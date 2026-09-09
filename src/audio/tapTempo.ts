/**
 * FlipDAW — tap tempo.
 * tap(sec): feed audio-clock seconds (ctx.currentTime). Median of the last
 * 3-4 intervals, clamp to the BPM range, reset after >2s pause.
 */

import { BPM_MAX, BPM_MIN } from './transport';

const PAUSE_RESET_SEC = 2;
const MAX_TAPS = 5;

export class TapTempo {
  private taps: number[] = [];

  /** Returns a new BPM once enough taps are registered, else null. */
  tap(sec: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && sec - last > PAUSE_RESET_SEC) this.taps = [];
    this.taps.push(sec);
    if (this.taps.length > MAX_TAPS) this.taps.shift();
    if (this.taps.length < 2) return null;

    const intervals: number[] = [];
    for (let i = 1; i < this.taps.length; i++) intervals.push(this.taps[i] - this.taps[i - 1]);
    const med = median(intervals);
    const bpm = Math.round(60 / med);
    return Math.min(BPM_MAX, Math.max(BPM_MIN, bpm));
  }

  reset(): void { this.taps = []; }
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}