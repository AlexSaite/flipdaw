/**
 * FlipDAW — step sequencer engine (M5.5).
 * Sample-accurate step scheduling on a 16th-note grid — identical trick to
 * ClipPlayer: every hit is pushed into the Scheduler queue with an exact
 * ctx-time, so `BufferSource.start(exact)` has zero jitter by construction.
 *
 * Per-step features: probability, ratchet (subdivision), flam (ghost hits),
 * plus pattern-level swing (shuffle on odd steps) and humanize (seeded jitter
 * on timing and velocity). ADR-001: all time comes from the transport.
 */

import type { Scheduler } from '../audio/scheduler';
import type { Seconds, Transport, Unsub } from '../audio/transport';
import type { SeqPattern, StepCell } from './model';

/** One sub-hit scheduled on the audio clock. */
export interface Hit { at: Seconds; velocity: number; src?: string }

/** Receives completed hits; implement over Web Audio or a fake in tests. */
export interface StepVoiceBus {
  play(sourceId: string, at: Seconds, velocity: number): void;
  /** Register (or replace) a sample-backed voice, keyed e.g. `smp:<sha>`. */
  setSample(sampleId: string, buffer: AudioBuffer): void;
}

export type Rng = () => number;

/** Deterministic PRNG — tests and "randomize pattern" share it. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 16th-note duration at bpm (one step on the 4/4 grid). */
export function stepDurSec(bpm: number): Seconds {
  return 60 / bpm / 4;
}

/** Swing delays an odd step by up to 1/3 of a step (classic shuffle). */
export function swingDelay(stepIndex: number, swing: number, stepDur: Seconds): Seconds {
  return stepIndex % 2 === 1 ? swing * stepDur * (1 / 3) : 0;
}

export interface StepSequencerOptions {
  transport: Transport;
  scheduler: Scheduler;
  /** Audio clock — injectable for tests. */
  now(): Seconds;
  pattern: SeqPattern;
  voice: StepVoiceBus;
  rng?: Rng;
  lookaheadSec?: number;
}

const DEFAULT_AHEAD = 0.12;
export const FLAM_SEC = 0.025;

export class StepSequencer {
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private readonly now: () => Seconds;
  private readonly voice: StepVoiceBus;
  private readonly rng: Rng;
  private readonly ahead: number;

  private pattern: SeqPattern | null;
  private scheduledOrds = new Set<number>();
  private unsubTick: Unsub;
  private armed = true;

  constructor(o: StepSequencerOptions) {
    this.transport = o.transport;
    this.scheduler = o.scheduler;
    this.now = o.now;
    this.voice = o.voice;
    this.rng = o.rng ?? Math.random;
    this.ahead = o.lookaheadSec ?? DEFAULT_AHEAD;
    this.pattern = o.pattern;
    this.unsubTick = this.scheduler.onTick(() => this.tick());
  }

  /** When false, no new hits are scheduled (never retro-kills already-queued 16ths). */
  setArmed(a: boolean): void {
    this.armed = a;
    if (!a) this.scheduledOrds.clear();
  }

  isArmed(): boolean { return this.armed; }

  setPattern(p: SeqPattern): void {
    this.pattern = p;
    this.scheduledOrds.clear();
  }

  clearScheduled(): void { this.scheduledOrds.clear(); }

  /** Step ordinal the transport is currently on (for the UI playhead). */
  playheadSteps(): number {
    if (!this.pattern) return 0;
    const beats = this.transport.nowBeats();
    const ord = Math.floor(beats * 4); // 16ths since bar start
    return ((ord % this.pattern.length) + this.pattern.length) % this.pattern.length;
  }

  dispose(): void {
    this.unsubTick();
    this.scheduledOrds.clear();
  }

  private tick(): void {
    const p = this.pattern;
    if (!p || !this.armed || !this.transport.playing) return;
    const now = this.now();
    const horizon = now + this.ahead;
    const beatNow = this.transport.nowBeats();
    const stepBeats = 0.25; // one 16th

    // first boundary at or after the current position (catch-up is safe:
    // already-scheduled ords are skipped via the set), then each 16th → horizon
    const firstOrd = Math.max(0, Math.floor(beatNow * 4));
    let ord = firstOrd;
    for (;;) {
      const bb = ord * stepBeats;
      const at = this.transport.secOfBeat(bb);
      if (at > horizon) break;
      if (at < now - 1e-6) { ord++; continue; } // already audible — don't replay
      if (!this.scheduledOrds.has(ord)) {
        this.scheduledOrds.add(ord);
        const stepIndex = ord % p.length;
        this.scheduleRowHits(p, stepIndex, at);
      }
      ord++;
    }
  }

  /** Fire every on-cell across all instrument rows for the step. */
  private scheduleRowHits(p: SeqPattern, stepIndex: number, base: Seconds): void {
    const stepDur = stepDurSec(this.transport.bpm);
    for (let r = 0; r < p.rows.length; r++) {
      const cell = p.rows[r].steps[stepIndex];
      if (cell.on) this.scheduleForStep(p, p.rows[r].voice, cell, stepIndex, base, stepDur);
    }
  }

  private scheduleForStep(p: SeqPattern, srcId: string, cell: StepCell, stepIndex: number, base: Seconds, stepDur: Seconds): void {
    if (this.rng() > cell.probability) return;

    const hu = p.humanize;
    const jitterTime = hu > 0 ? (this.rng() * 2 - 1) * hu * stepDur * 0.1 : 0;
    const t0 = base + swingDelay(stepIndex, p.swing, stepDur) + jitterTime;

    const velJitter = hu > 0 ? 1 - hu * 0.3 * this.rng() : 1;
    const vel = Math.max(0, Math.min(1, cell.velocity * velJitter));

    const n = cell.ratchet;
    for (let i = 0; i < n; i++) {
      this.voice.play(srcId, t0 + (i * stepDur) / n, vel);
    }
    for (let k = 1; k <= cell.flam; k++) {
      this.voice.play(srcId, base + swingDelay(stepIndex, p.swing, stepDur) + k * FLAM_SEC, vel * 0.7);
    }
  }
}