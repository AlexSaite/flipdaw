/**
 * FlipDAW — single clip player: state machine
 *   empty -> loaded -> queued -> playing -> stopping -> loaded
 * Tap = toggle(q): start/stop strictly on quantize boundary.
 * Stop = setTargetAtTime(0) + stop(t + 2*fade) — no clicks.
 */

import type { EventHandle, Scheduler } from './scheduler';
import type { Quantize, Seconds, Transport, Unsub } from './transport';
import type { TrackStrip } from './graph';

export type ClipState = 'empty' | 'loaded' | 'queued' | 'playing' | 'stopping';

export interface ClipPlayerOptions {
  ctx: AudioContext;
  transport: Transport;
  scheduler: Scheduler;
  strip: TrackStrip;
  fadeSec?: Seconds;
}

export interface ToggleResult { action: 'start' | 'stop' | 'none'; atSec: Seconds | null }

export class ClipPlayer {
  private readonly ctx: AudioContext;
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private readonly strip: TrackStrip;
  private readonly fade: Seconds;

  private buffer: AudioBuffer | null = null;
  private _state: ClipState = 'empty';
  private gainValue = 0.9;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private startAt: Seconds | null = null;
  private pending: EventHandle | null = null;
  private listeners = new Set<(s: ClipState) => void>();

  constructor(o: ClipPlayerOptions) {
    this.ctx = o.ctx;
    this.transport = o.transport;
    this.scheduler = o.scheduler;
    this.strip = o.strip;
    this.fade = o.fadeSec ?? 0.01;
  }

  get state(): ClipState { return this._state; }
  get lengthSec(): Seconds | null { return this.buffer?.duration ?? null; }
  get attached(): boolean { return this.buffer !== null; }

  attach(buffer: AudioBuffer): void {
    this.buffer = buffer;
    if (this._state === 'empty') this.setState('loaded');
  }

  /** Remove the attached buffer (undo of import). */
  detach(): void {
    this.panic();
    this.buffer = null;
    this.setState('empty');
  }

  setGain(v: number): void {
    this.gainValue = v;
    this.gainNode?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  /** User tap. Returns WHAT and WHEN will happen. */
  toggle(q: Quantize): ToggleResult {
    switch (this._state) {
      case 'empty':
        return { action: 'none', atSec: null };
      case 'loaded': {
        const at = this.transport.nextBoundarySec(q);
        this.pending = this.scheduler.at(at, (t) => this.startSource(t));
        this.startAt = at;
        this.setState('queued');
        return { action: 'start', atSec: at };
      }
      case 'queued':                 // changed mind before start — cancel
        this.pending?.cancel();
        this.pending = null;
        this.setState('loaded');
        return { action: 'none', atSec: null };
      case 'playing': {
        const at = this.transport.nextBoundarySec(q);
        this.scheduler.at(at, (t) => this.stopSource(t));
        this.setState('stopping');
        return { action: 'stop', atSec: at };
      }
      case 'stopping':
        return { action: 'none', atSec: null };
    }
  }

  /** Immediate stop (transport stop / panic). */
  panic(): void {
    this.pending?.cancel();
    this.pending = null;
    if (this.source) this.stopSource(this.ctx.currentTime);
    else if (this._state !== 'empty' && this._state !== 'loaded') this.setState('loaded');
  }

  /** Position within loop 0..1 at time now — for progress ring. */
  progress(now: Seconds): number {
    if (this._state !== 'playing' || this.startAt === null || !this.buffer) return 0;
    if (now <= this.startAt) return 0;
    return ((now - this.startAt) / this.buffer.duration) % 1;
  }

  onState(cb: (s: ClipState) => void): Unsub {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private startSource(t: Seconds): void {
    if (!this.buffer || this._state !== 'queued') return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = this.gainValue;
    src.connect(g);
    g.connect(this.strip.input);
    src.start(t);
    this.source = src;
    this.gainNode = g;
    this.startAt = t;
    this.setState('playing');
  }

  private stopSource(t: Seconds): void {
    const src = this.source;
    const g = this.gainNode;
    this.source = null;
    this.gainNode = null;
    if (!src || !g) { this.setState('loaded'); return; }
    g.gain.setTargetAtTime(0, t, this.fade / 3);
    src.stop(t + this.fade * 2);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    this.setState('loaded');
  }

  private setState(s: ClipState): void {
    if (s === this._state) return;
    this._state = s;
    this.listeners.forEach((cb) => cb(s));
  }
}
