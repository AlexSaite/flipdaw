/**
 * FlipDAW — quantized loop recorder.
 * arm(): resolve start on a grid boundary (+ optional count-in bars).
 * requestStop(): resolve stop on a grid boundary, never shorter than minBars.
 * Capture is delegated to an injected Capturer (WorkletCapture in the app),
 * so all sample-accurate logic is testable with mocks (ADR-001).
 */

import type { EventHandle, Scheduler } from './scheduler';
import type { Quantize, Seconds, Transport } from './transport';

export interface Capturer {
  /** Begin capturing audio at ctx-time `at` (sample-accurate start). */
  start(at: Seconds): void;
  /** Stop capturing at `at`; resolves with the recorded AudioBuffer. */
  stop(at: Seconds): Promise<AudioBuffer>;
  dispose(): void;
}

export type RecordState = 'idle' | 'arming' | 'recording' | 'stopping';

export interface RecorderOptions {
  transport: Transport;
  scheduler: Scheduler;
  capture: Capturer;
  /** Current ctx time (engine injects () => ctx.currentTime). */
  now: () => Seconds;
  quantize?: Exclude<Quantize, 'off'>;
  minBars?: number;
  /** Count-in bars before the recording actually starts. */
  countInBars?: number;
  onState?: (s: RecordState) => void;
  onBuffer?: (buf: AudioBuffer, startSec: Seconds, endSec: Seconds) => void;
}

export class Recorder {
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private readonly capture: Capturer;
  private readonly now: () => Seconds;
  private readonly q: Exclude<Quantize, 'off'>;
  private readonly minBars: number;
  private readonly countInBars: number;
  private readonly onState?: (s: RecordState) => void;
  private readonly onBuffer?: (buf: AudioBuffer, startSec: Seconds, endSec: Seconds) => void;

  private _state: RecordState = 'idle';
  private startAt: Seconds | null = null;
  private handles: EventHandle[] = [];

  constructor(o: RecorderOptions) {
    this.transport = o.transport;
    this.scheduler = o.scheduler;
    this.capture = o.capture;
    this.now = o.now;
    this.q = o.quantize ?? '1bar';
    this.minBars = o.minBars ?? 1;
    this.countInBars = o.countInBars ?? 0;
    this.onState = o.onState;
    this.onBuffer = o.onBuffer;
  }

  get state(): RecordState { return this._state; }
  /** ctx-time the loop recording starts/captured from. */
  get loopStartSec(): Seconds | null { return this.startAt; }

  /** Start arming; returns the exact capture-start ctx-time (or null if busy). */
  arm(): Seconds | null {
    if (this._state !== 'idle') return null;
    let at = this.transport.nextBoundarySec(this.q);
    if (this.countInBars > 0) at += this.countInBars * this.secPerBar();
    this.startAt = at;
    this.setState('arming');
    this.handles.push(this.scheduler.at(at, (t) => this.begin(t)));
    return at;
  }

  /** Stop (quantized); returns the stop ctx-time (or null if not recording). */
  requestStop(): Seconds | null {
    if (this._state !== 'recording' || this.startAt === null) return null;
    let at = this.transport.nextBoundarySec(this.q, this.now());
    const minLen = this.secPerBar() * this.minBars;
    const longest = this.startAt + minLen;
    if (at < longest) at = longest;
    this.setState('stopping');
    this.handles.push(this.scheduler.at(at, () => void this.finish(at)));
    return at;
  }

  /** Abort while arming (or before stop was requested). */
  cancel(): void {
    this.startAt = null;
    this.handles.forEach((h) => h.cancel());
    this.handles = [];
    this.setState('idle');
  }

  /** Immediate stop of everything recorder-related (panic). */
  panic(): void {
    this.cancel();
  }

  private secPerBar(): Seconds {
    return (this.transport.beatsPerBar * 60) / this.transport.bpm;
  }

  private begin(t: Seconds): void {
    this.capture.start(t);
    this.setState('recording');
  }

  private async finish(at: Seconds): Promise<void> {
    const start = this.startAt;
    this.startAt = null;
    this.handles = [];
    try {
      const buf = await this.capture.stop(at);
      if (this.onBuffer && start !== null) this.onBuffer(buf, start, at);
    } finally {
      this.setState('idle');
    }
  }

  private setState(s: RecordState): void {
    if (s === this._state) return;
    this._state = s;
    this.onState?.(s);
  }
}