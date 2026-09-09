/**
 * FlipDAW — arrangement player (M5).
 * Sample-accurate scheduling of timeline items: every clip start is pushed
 * into the Scheduler queue, so `BufferSource.start(exactSec)` fires exactly
 * on the grid (jitter-free by construction, same trick as ClipPlayer).
 *
 * Beat-mapped semantics (clips keep recorded tempo, ADR-002):
 *   slotBeats <  natural length  → hard trim: faded stop at slot end
 *   slotBeats >= natural length  → loop the clip to fill the slot
 * All start/stop times are derived from the transport bpm → continuous
 * resequencing when the user changes tempo.
 */

import type { Scheduler } from './scheduler';
import type { Seconds, Transport, Unsub } from './transport';
import type { TrackStrip } from './graph';
import type { Arrangement, ArrItem } from '../timeline/model';

export interface ArrangementPlayerOptions {
  ctx: AudioContext;
  transport: Transport;
  scheduler: Scheduler;
  stripFor(trackId: string): TrackStrip;
  /** Resolve clip media → decoded buffer (null = not loaded yet). */
  getBuffer(sourceId: string): AudioBuffer | null;
  /** Current audio time. Defaults to ctx.currentTime — injectable for tests. */
  now?(): Seconds;
  fadeSec?: Seconds;
}

export class ArrangementPlayer {
  private readonly ctx: AudioContext;
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private readonly stripFor: (trackId: string) => TrackStrip;
  private readonly getBuffer: (sourceId: string) => AudioBuffer | null;
  private readonly now: () => Seconds;
  private readonly fade: Seconds;

  private arrangement: Arrangement | null = null;
  private scheduled = new Set<string>();
  private live = new Map<string, { src: AudioBufferSourceNode; g: GainNode; stopAt: Seconds | null }>();
  private unsubSched: Unsub;

  constructor(o: ArrangementPlayerOptions) {
    this.ctx = o.ctx;
    this.transport = o.transport;
    this.scheduler = o.scheduler;
    this.stripFor = o.stripFor;
    this.getBuffer = o.getBuffer;
    this.now = o.now ?? (() => o.ctx.currentTime);
    this.fade = o.fadeSec ?? 0.01;
    this.unsubSched = this.scheduler.onTick(() => this.tick());
  }

  /** Attach a new arrangement and restart everything. */
  setArrangement(arr: Arrangement): void {
    this.clearAll();
    this.arrangement = arr;
  }

  get activeArrangement(): Arrangement | null { return this.arrangement; }

  dispose(): void {
    this.clearAll();
    this.unsubSched();
  }

  /** Schedule every item whose start entered the lookahead window. */
  private tick(): void {
    const arr = this.arrangement;
    if (!arr || !this.transport.playing) return;
    const nowSec = this.now();
    const ahead = 0.12; // keep in step with scheduler default
    for (const it of arr.clips) {
      if (this.scheduled.has(it.id)) continue;
      const startSec = this.secOf(it);
      if (startSec - nowSec <= ahead) {
        this.scheduled.add(it.id);
        this.scheduler.at(startSec, (exact) => this.startItem(it, exact));
      }
    }
  }

  private secOf(it: ArrItem): Seconds {
    return this.transport.secOfBeat(it.startBeats);
  }

  private slotLenSec(it: ArrItem): Seconds {
    return (it.lengthBeats * 60) / this.transport.bpm;
  }

  private startItem(it: ArrItem, t: Seconds): void {
    const buf = this.getBuffer(it.sourceId);
    if (!buf) {
      // media still loading → retry next tick
      this.scheduled.delete(it.id);
      return;
    }
    const strip = this.stripFor(it.trackId);
    const g = this.ctx.createGain();
    g.gain.value = 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = this.slotLenSec(it) >= buf.duration;
    src.connect(g);
    g.connect(strip.input);
    src.start(t);

    let stopAt: Seconds | null = null;
    if (!src.loop) stopAt = t + (this.slotLenSec(it) - this.fade * 2); // trim before click
    if (stopAt !== null) {
      const stopT = stopAt;
      this.scheduler.at(stopT, () => {
        g.gain.setTargetAtTime(0, stopT, this.fade / 3);
        src.stop(stopT + this.fade * 2);
        src.onended = () => { src.disconnect(); g.disconnect(); };
      });
    } else {
      src.onended = () => { src.disconnect(); g.disconnect(); };
    }
    this.live.set(it.id, { src, g, stopAt });
  }

  private clearAll(): void {
    this.scheduled.clear();
    for (const { src, g } of this.live.values()) {
      src.onended = null;
      src.stop(this.ctx.currentTime);
      src.disconnect();
      g.disconnect();
    }
    this.live.clear();
  }
}