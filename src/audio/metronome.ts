/**
 * FlipDAW — metronome. Accent on beat 1 of the bar.
 * Scheduled on the audio clock (oscillator.start(exactSec)) exactly like clip
 * events — plays only while transport is playing. No performance.now() (ADR-001).
 */

import type { Seconds, Transport } from './transport';

export interface ClickSink {
  (at: Seconds, accent: boolean, gain: number): void;
}

export interface MetronomeOptions {
  transport: Transport;
  /** Lookahead scheduling window, sec. */
  aheadSec?: Seconds;
  /** Where clicks go. Inject for tests; default builds oscillators on ctx. */
  playClick?: ClickSink;
}

const EPS_BEATS = 1e-6;

export class Metronome {
  private readonly transport: Transport;
  private readonly ahead: Seconds;
  private readonly sink: ClickSink;

  private _enabled = false;
  private _gain = 0.6;
  private armed = false;
  private nextBeat = 0;

  constructor(o: MetronomeOptions) {
    this.transport = o.transport;
    this.ahead = o.aheadSec ?? 0.12;
    this.sink = o.playClick ?? ((at, accent, gain) => {
      console.warn('Metronome without click sink:', at, accent, gain);
    });
  }

  get enabled(): boolean { return this._enabled; }
  get gain(): number { return this._gain; }

  setEnabled(v: boolean): void {
    this._enabled = v;
    if (!v) this.armed = false;
  }

  setGain(g: number): void {
    this._gain = Math.min(1, Math.max(0, g));
  }

  /** Called from the scheduler tick (audio thread side). */
  tick(nowSec: Seconds): void {
    if (!this._enabled || !this.transport.playing) {
      this.armed = false;
      return;
    }
    if (!this.armed) {
      // (Re)sync after start/reset: arm right after the current instant
      this.nextBeat = Math.ceil(this.transport.nowBeats(nowSec) - EPS_BEATS);
      this.armed = true;
    }
    const horizon = this.transport.nowBeats(nowSec + this.ahead);
    const ppb = this.transport.beatsPerBar;
    while (this.nextBeat <= horizon) {
      const beat = this.nextBeat;
      const at = this.transport.secOfBeat(beat, nowSec);
      if (at >= nowSec) {
        const accent = beat % ppb === 0;
        this.sink(at, accent, this._gain);
      }
      this.nextBeat += 1;
    }
  }
}

/** Real click: short pitch pip, accent on beat 1 is louder + brighter. */
export function createClickSound(ctx: AudioContext | OfflineAudioContext): ClickSink {
  return (at, accent, gain) => {
    if (at < ctx.currentTime) return;
    const o = ctx.createOscillator();
    o.type = 'square' as OscillatorType;
    o.frequency.value = accent ? 1760 : 1175;
    const g = ctx.createGain();
    const peak = gain * (accent ? 0.5 : 0.32);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.08);
  };
}