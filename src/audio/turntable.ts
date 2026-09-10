/**
 * FlipDAW — turntable player (M7, SL-1200 skin). A free-running platter:
 * a single loaded WAV loops as a vinyl record, pitch (30–160%) and
 * sample-accurate scrubbing via `seek()`, continuity bookkeeping on rate
 * change. Not grid-locked — the turntable is a standalone instrument, like
 * a DJ deck without the crossfader. All timing on ctx.currentTime (ADR-001).
 */

import type { Seconds } from './transport';

export type PlatterState = 'empty' | 'stopped' | 'spinning';

export interface TurntableOptions {
  ctx: AudioContext;
  input: AudioNode;
  gain?: number;
}

export const TT_MIN_RATE = 0.5;
export const TT_MAX_RATE = 1.6;
export const TT_FADE = 0.012;

export class TurntablePlayer {
  private readonly o: TurntableOptions;
  private buffer: AudioBuffer | null = null;
  private src: AudioBufferSourceNode | null = null;
  private g: GainNode | null = null;
  private _state: PlatterState = 'empty';
  private _rate = 1;
  private _gain: number;
  private startAt: Seconds = 0;
  private startOffset: Seconds = 0;

  constructor(o: TurntableOptions) {
    this.o = o;
    this._gain = o.gain ?? 0.9;
  }

  get state(): PlatterState { return this._state; }
  get playing(): boolean { return this._state === 'spinning'; }
  get attached(): boolean { return this.buffer !== null; }
  get rate(): number { return this._rate; }
  get gain(): number { return this._gain; }
  get duration(): Seconds { return this.buffer?.duration ?? 0; }

  load(buffer: AudioBuffer): void {
    this.tearDown(this.o.ctx.currentTime);
    this.buffer = buffer;
    this.startOffset = 0;
    this._state = buffer ? 'stopped' : 'empty';
  }

  setRate(r: number): void {
    const r2 = Math.min(TT_MAX_RATE, Math.max(TT_MIN_RATE, r));
    if (r2 === this._rate) return;
    const now = this.o.ctx.currentTime;
    if (this.playing && this.src) this.startOffset = this.offsetAt(now);
    this.startAt = now;
    this._rate = r2;
    if (this.src) this.src.playbackRate.value = this._rate;
  }

  /** Instant play from the current needle position (loop = whole record). */
  play(): void {
    if (!this.buffer || this.playing) return;
    const now = this.o.ctx.currentTime;
    this.startSource(now, this.startOffset);
    this._state = 'spinning';
  }

  /** Stop the platter; the needle keeps its position. */
  stop(): void {
    if (!this.playing) return;
    const now = this.o.ctx.currentTime;
    this.startOffset = this.offsetAt(now);
    this.stopSource(now);
    this._state = this.buffer ? 'stopped' : 'empty';
  }

  /** Sample-accurate needle drop (keeps spin state, jumps the record). */
  seek(sec: Seconds): void {
    if (!this.buffer) return;
    const c = Math.min(this.buffer.duration, Math.max(0, sec));
    const now = this.o.ctx.currentTime;
    this.startOffset = c;
    if (this.playing) {
      this.tearDown(now);
      this.startSource(now, c);
      this._state = 'spinning';
    }
  }

  /** Needle position in seconds at `now` (rate-scaled since last anchor). */
  offsetAt(now: Seconds): Seconds {
    if (!this.buffer) return 0;
    const d = this.buffer.duration;
    const elapsed = this.playing ? (now - this.startAt) * this._rate : 0;
    const raw = this.startOffset + elapsed;
    const w = raw % d;
    return w < 0 ? w + d : w;
  }

  /** 0..1 position across the record for the platter/needle visuals. */
  progress(now: Seconds): number {
    return this.buffer ? this.offsetAt(now) / this.buffer.duration : 0;
  }

  setGain(v: number): void {
    this._gain = v;
    if (this.g) this.g.gain.value = v;
  }

  private startSource(t: Seconds, offset: Seconds): void {
    if (!this.buffer) return;
    const src = this.o.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true; // the record spins until we stop it
    src.playbackRate.value = this._rate;
    const g = this.o.ctx.createGain();
    g.gain.value = this._gain;
    src.connect(g);
    g.connect(this.o.input);
    src.start(t, offset);
    this.src = src;
    this.g = g;
    this.startAt = t;
  }

  private stopSource(t: Seconds): void {
    const src = this.src;
    const g = this.g;
    this.src = null;
    this.g = null;
    if (src && g) {
      const fade = TT_FADE;
      g.gain.setTargetAtTime(0, t, fade / 3);
      src.stop(t + fade * 2);
      src.onended = () => { src.disconnect(); g.disconnect(); };
    }
  }

  private tearDown(t: Seconds): void {
    const src = this.src;
    const g = this.g;
    this.src = null;
    this.g = null;
    if (src && g) {
      const fade = TT_FADE;
      g.gain.setTargetAtTime(0, t, fade / 3);
      src.stop(t + fade * 2);
      src.onended = () => { src.disconnect(); g.disconnect(); };
    }
  }
}