/**
 * FlipDAW — lookahead scheduler ("two clocks", Web Audio classic).
 *  - AUDIO events: fn(exactSec) is called on tick when the event entered
 *    the window [now, now + AHEAD); inside fn we create SourceNode.start(exactSec) —
 *    start is sample-accurate, jitter = 0 by construction.
 *  - UI events: drained in pumpUi() (attached to rAF in the browser),
 *    when ctx-time reached the mark — for "queued" pulsing and changing
 *    cell state exactly on the beat.
 */

import type { Seconds } from './transport';

export interface SchedulerOptions {
  /** Audio clock: () => ctx.currentTime */
  clock: () => Seconds;
  /** Lookahead scheduling window, sec. Default 0.12 */
  lookaheadSec?: Seconds;
  /** Tick period, ms. Default 25 */
  tickMs?: number;
}

export interface EventHandle { cancel(): void }

interface SchedEvent {
  time: Seconds;
  fn: (exact: Seconds) => void;
  dead: boolean;
}

const DEFAULT_AHEAD: Seconds = 0.12;
const DEFAULT_TICK_MS = 25;

export class Scheduler {
  private readonly clock: () => Seconds;
  private readonly ahead: Seconds;
  private readonly tickMs: number;

  private audioQ: SchedEvent[] = [];
  private uiQ: SchedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private running = false;
  private tickFns = new Set<() => void>();

  constructor(opts: SchedulerOptions) {
    this.clock = opts.clock;
    this.ahead = opts.lookaheadSec ?? DEFAULT_AHEAD;
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS;
  }

  get isRunning(): boolean { return this.running; }

  /** Audio event at absolute ctx-time. */
  at(time: Seconds, fn: (exact: Seconds) => void): EventHandle {
    return this.push(this.audioQ, time, fn);
  }

  /** UI event: fires in pumpUi() when time has arrived. */
  uiAt(time: Seconds, fn: (exact: Seconds) => void): EventHandle {
    return this.push(this.uiQ, time, fn);
  }

  /** Process audio queue: everything in [now, now + ahead). */
  tick(): void {
    this.drain(this.audioQ, this.clock() + this.ahead);
    this.tickFns.forEach((fn) => fn());
  }

  /** Subscribe to tick() calls (e.g. metronome scheduling). Returns unsub. */
  onTick(fn: () => void): () => void {
    this.tickFns.add(fn);
    return () => { this.tickFns.delete(fn); };
  }

  /** Process UI queue: everything whose time <= now. */
  pumpUi(): void {
    this.drain(this.uiQ, this.clock());
  }

  /** Start tick (setInterval) and rAF loop for pumpUi. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    if (typeof requestAnimationFrame === 'function') {
      const loop = (): void => {
        this.pumpUi();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    }
  }

  /** Full stop and queue cleanup (panic). */
  stop(): void {
    this.running = false;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.audioQ = [];
    this.uiQ = [];
  }

  private push(q: SchedEvent[], time: Seconds, fn: (exact: Seconds) => void): EventHandle {
    const ev: SchedEvent = { time, fn, dead: false };
    q.push(ev);
    q.sort((a, b) => a.time - b.time); // queues are small, sort is enough
    return { cancel: () => { ev.dead = true; } };
  }

  private drain(q: SchedEvent[], horizon: Seconds): void {
    while (q.length > 0 && q[0].time <= horizon) {
      const ev = q.shift() as SchedEvent;
      if (!ev.dead) ev.fn(ev.time);
    }
  }
}
