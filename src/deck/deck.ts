/**
 * FlipDAW — DJ deck player (M6.3). Loads a clip/buffer, plays on the
 * transport bar grid (quantized launch), sync = phase-align to the next bar,
 * hot cue = sample-accurate jump, loop = bar-region wrap. Playback rate is
 * locked at 1.0 — decks follow the transport grid without time-stretch
 * (ADR-012). Timing on ctx.currentTime only (ADR-001).
 */

import type { EventHandle, Scheduler } from '../audio/scheduler';
import type { Quantize, Seconds, Transport } from '../audio/transport';

export type DeckState = 'empty' | 'stopped' | 'playing';

export interface DeckOptions {
  ctx: AudioContext;
  transport: Transport;
  scheduler: Scheduler;
  input: AudioNode;
  fadeSec?: Seconds;
}

export const DECK_FADE = 0.012;
const EPS_FUTURE = 5e-4;

export class Deck {
  private readonly o: DeckOptions;

  private buffer: AudioBuffer | null = null;
  private src: AudioBufferSourceNode | null = null;
  private g: GainNode | null = null;
  private _state: DeckState = 'empty';
  private startAt: Seconds = 0;
  private startBeat = 0;
  private startHandle: EventHandle | null = null;
  private stopHandle: EventHandle | null = null;
  private wrapHandle: EventHandle | null = null;
  private _cueBeat: number | null = null;
  private _loopBeats: number | null = null;
  private loopStartBeat: number | null = null;

  constructor(o: DeckOptions) {
    this.o = o;
  }

  get state(): DeckState { return this._state; }
  get playing(): boolean { return this._state === 'playing'; }
  get attached(): boolean { return this.buffer !== null; }
  get cueBeat(): number | null { return this._cueBeat; }
  get loopBeats(): number | null { return this._loopBeats; }

  load(buffer: AudioBuffer): void {
    this.tearDown(this.o.ctx.currentTime);
    this.buffer = buffer;
    this._state = buffer ? 'stopped' : 'empty';
  }

  /** Quantized start on the grid. Returns the ctx-time it will sound at. */
  play(q: Quantize = '1bar'): Seconds | null {
    if (!this.buffer || this._state === 'playing') return null;
    const at = this.o.transport.nextBoundarySec(q);
    this.scheduleStart(at);
    return at;
  }

  /** Quantized pause: audio stops on the grid boundary. */
  pause(q: Quantize = '1bar'): Seconds | null {
    if (this._state !== 'playing') return null;
    const at = this.o.transport.nextBoundarySec(q);
    this.stopHandle = this.o.scheduler.at(at, (t) => this.stopSource(t));
    this._state = 'stopped';
    return at;
  }

  /** Phase-align to the transport bar (rate stays 1.0, ADR-012). */
  sync(): Seconds | null {
    if (!this.buffer) return null;
    const at = this.o.transport.nextBoundarySec('1bar');
    const b0 = this.o.transport.nowBeats(at);
    this.cancelPending();
    this.queueStart(at, b0);
    this._state = 'playing';
    return at;
  }

  /** Sample-accurate jump to a transport beat. */
  seek(beat: number): void {
    if (!this.buffer) return;
    const now = this.o.ctx.currentTime;
    const at = Math.max(now, this.o.transport.secOfBeat(beat, now));
    this.tearDown(now);
    this.queueStart(at, beat);
    this._state = 'playing';
  }

  cueAt(beat: number): void { this._cueBeat = beat; }
  jumpCue(): void { if (this._cueBeat !== null) this.seek(this._cueBeat); }

  /** Loop region in beats (bar-aligned snap at start); null removes the loop. */
  setLoop(beats: number | null): void {
    this._loopBeats = beats !== null ? Math.max(1, Math.round(beats)) : null;
    if (this._state === 'playing') this.scheduleWrap(this.o.ctx.currentTime);
  }

  /** Musical position in beats at `now` (folded into the loop region). */
  positionBeat(now: Seconds): number {
    const bpm = this.o.transport.bpm;
    const abs = this.startBeat + (now - this.startAt) * (bpm / 60);
    if (this._loopBeats !== null && this.loopStartBeat !== null) {
      const len = this._loopBeats;
      return this.loopStartBeat + ((((abs - this.loopStartBeat) % len) + len) % len);
    }
    return abs;
  }

  /** 0..1 position for the waveform marker. */
  progress(now: Seconds): number {
    if (this._state !== 'playing' || !this.buffer) return 0;
    if (this._loopBeats !== null && this.loopStartBeat !== null) {
      return Math.max(0, Math.min(1, (this.positionBeat(now) - this.loopStartBeat) / this._loopBeats));
    }
    const w = ((now - this.startAt) / this.buffer.duration) % 1;
    return w < 0 ? w + 1 : w;
  }

  private scheduleStart(at: Seconds): void {
    this.cancelPending();
    const b0 = this.o.transport.nowBeats(at);
    this.queueStart(at, b0);
    this._state = 'playing';
  }

  private queueStart(at: Seconds, beat: number): void {
    this.startAt = at;
    this.startBeat = beat;
    const now = this.o.ctx.currentTime;
    if (at <= now + EPS_FUTURE) this.startSource(at, beat);
    else this.startHandle = this.o.scheduler.at(at, (t) => {
      this.startHandle = null;
      this.startSource(t, beat);
    });
  }

  private startSource(t: Seconds, beat: number): void {
    if (!this.buffer) return;
    const src = this.o.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = 1; // ADR-012: deck rate is fixed, sync = phase only
    src.loop = this._loopBeats === null; // free-run loops the whole file; loop regions wrap manually
    const g = this.o.ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(this.o.input);
    src.start(t);
    this.src = src;
    this.g = g;
    this.startAt = t;
    this.startBeat = beat;
    this._state = 'playing';
    this.scheduleWrap(t);
  }

  private stopSource(t: Seconds): void {
    this.cancelPending();
    const src = this.src;
    const g = this.g;
    this.src = null;
    this.g = null;
    if (src && g) {
      const fade = this.o.fadeSec ?? DECK_FADE;
      g.gain.setTargetAtTime(0, t, fade / 3);
      src.stop(t + fade * 2);
      src.onended = () => { src.disconnect(); g.disconnect(); };
    }
    this._state = this.buffer ? 'stopped' : 'empty';
  }

  /** Immediate stop used by seek()/load() — no state flip afterwards. */
  private tearDown(t: Seconds): void {
    this.cancelPending();
    const src = this.src;
    const g = this.g;
    this.src = null;
    this.g = null;
    if (src && g) {
      const fade = this.o.fadeSec ?? DECK_FADE;
      g.gain.setTargetAtTime(0, t, fade / 3);
      src.stop(t + fade * 2);
      src.onended = () => { src.disconnect(); g.disconnect(); };
    }
  }

  private cancelPending(): void {
    if (this.startHandle) { this.startHandle.cancel(); this.startHandle = null; }
    if (this.stopHandle) { this.stopHandle.cancel(); this.stopHandle = null; }
    if (this.wrapHandle) { this.wrapHandle.cancel(); this.wrapHandle = null; }
  }

  private scheduleWrap(t: Seconds): void {
    if (this.wrapHandle) { this.wrapHandle.cancel(); this.wrapHandle = null; }
    if (this._loopBeats === null || this._state !== 'playing' || !this.buffer) return;
    const grid = this.o.transport.beatsPerBar;
    const snap = Math.max(0, Math.ceil(this.startBeat / grid - 1e-6) * grid);
    this.loopStartBeat = snap;
    const period = (this._loopBeats * 60) / this.o.transport.bpm;
    let endSec = this.o.transport.secOfBeat(this.loopStartBeat + this._loopBeats, this.o.ctx.currentTime);
    while (endSec <= t + 1e-3) endSec += period;
    this.wrapHandle = this.o.scheduler.at(endSec, (tt) => {
      this.wrapHandle = null;
      this.wrapToStart(tt);
    });
  }

  private wrapToStart(t: Seconds): void {
    if (this._state !== 'playing' || this._loopBeats === null) return;
    const old = this.src;
    const oldG = this.g;
    this.src = null;
    this.g = null;
    if (old && oldG) {
      const fade = this.o.fadeSec ?? DECK_FADE;
      oldG.gain.setTargetAtTime(0, t, fade / 3);
      old.stop(t + fade * 2);
      old.onended = () => { old.disconnect(); oldG.disconnect(); };
    }
    this.startSource(t, this.loopStartBeat ?? this.startBeat);
  }
}