/**
 * FlipDAW — transport: the single source of musical time.
 * Rule: the audio path lives ONLY on ctx.currentTime; the UI reads position via rAF.
 * ADR-001: no performance.now()/Date.now() in time calculations.
 */

export type Seconds = number;
export type Beat = number;
export type Unsub = () => void;

/**
 * Quantize grid (note duration relative to whole note):
 *  '1/4'  = quarter
 *  '1/2'  = half
 *  '1bar' / '2bar' = 1 / 2 bars
 *  'off'  = launch immediately
 */
export type Quantize = 'off' | '1/4' | '1/2' | '1bar' | '2bar';

export interface TransportState {
  bpm: number;
  timeSig: readonly [number, number];
  playing: boolean;
}

/** Minimal slice of AudioContext needed by the transport (for testability). */
export interface AudioClock {
  readonly currentTime: Seconds;
}

export const BPM_MIN = 40;
export const BPM_MAX = 240;

/** Tolerance "we are exactly on boundary": treat boundary as current, not next. */
const EPS_BEATS = 1e-6;

export function clampBpm(bpm: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

export class Transport {
  private readonly clock: AudioClock;
  private _bpm: number;
  private _timeSig: readonly [number, number];
  private _playing = false;

  /** Anchor: position in beats and moment (sec) when it was that.
   *  Re-anchor on start()/stop()/setBpm()/setTimeSig() —
   *  gives position continuity when tempo changes. */
  private anchorBeats: Beat = 0;
  private anchorSec: Seconds;

  private listeners = new Set<(s: TransportState) => void>();

  constructor(clock: AudioClock, bpm = 120, timeSig: readonly [number, number] = [4, 4]) {
    this.clock = clock;
    this._bpm = clampBpm(bpm);
    this._timeSig = timeSig;
    this.anchorSec = clock.currentTime;
  }

  get bpm(): number { return this._bpm; }
  get timeSig(): readonly [number, number] { return this._timeSig; }
  get playing(): boolean { return this._playing; }
  /** Beats per bar: 4/4 -> 4; 6/8 -> 3. */
  get beatsPerBar(): Beat { return this._timeSig[0] * (4 / this._timeSig[1]); }

  start(): void {
    if (this._playing) return;
    this.anchorSec = this.clock.currentTime; // continue from anchorBeats
    this._playing = true;
    this.emit();
  }

  /** Transport pause (position holds). Clips are stopped by their players. */
  stop(): void {
    if (!this._playing) return;
    this.anchorBeats = this.nowBeats();
    this._playing = false;
    this.emit();
  }

  /** Rewind to zero (can be on the fly). */
  reset(): void {
    this.anchorBeats = 0;
    this.anchorSec = this.clock.currentTime;
    this.emit();
  }

  setBpm(bpm: number): void {
    const next = clampBpm(bpm);
    if (next === this._bpm) return;
    this.anchorBeats = this.nowBeats();
    this.anchorSec = this.clock.currentTime;
    this._bpm = next;
    this.emit();
  }

  setTimeSig(sig: readonly [number, number]): void {
    this.anchorBeats = this.nowBeats();
    this.anchorSec = this.clock.currentTime;
    this._timeSig = sig;
    this.emit();
  }

  /** Position in beats at time fromSec (default: now). */
  nowBeats(fromSec?: Seconds): Beat {
    const t = fromSec ?? this.clock.currentTime;
    if (!this._playing) return this.anchorBeats;
    return this.anchorBeats + (t - this.anchorSec) * (this._bpm / 60);
  }

  /** ctx-time of the nearest grid boundary q, >= fromSec.
   *  If currently exactly on boundary — return "now" (launch without waiting).
   *  ADR-002: bpm between now and boundary is constant (sufficient for MVP). */
  nextBoundarySec(q: Quantize, fromSec?: Seconds): Seconds {
    const t = fromSec ?? this.clock.currentTime;
    if (q === 'off') return t;
    const grid = this.quantizeBeats(q);
    const b = this.nowBeats(t);
    const next = Math.ceil(b / grid - EPS_BEATS) * grid;
    return t + (next - b) * (60 / this._bpm);
  }

  quantizeBeats(q: Exclude<Quantize, 'off'>): Beat {
    switch (q) {
      case '1/4': return 1;
      case '1/2': return 2;
      case '1bar': return this.beatsPerBar;
      case '2bar': return this.beatsPerBar * 2;
    }
  }

  /** ctx-time when transport will be at beat (bpm constant). */
  secOfBeat(beat: Beat, fromSec?: Seconds): Seconds {
    const t0 = fromSec ?? this.clock.currentTime;
    const b0 = this.nowBeats(t0);
    return t0 + (beat - b0) * (60 / this._bpm);
  }

  state(): TransportState {
    return { bpm: this._bpm, timeSig: this._timeSig, playing: this._playing };
  }

  subscribe(cb: (s: TransportState) => void): Unsub {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emit(): void {
    const s = this.state();
    this.listeners.forEach((cb) => cb(s));
  }
}
