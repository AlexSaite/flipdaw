/**
 * FlipDAW — pattern chain (M5.5, from drumhaus/Drum Loop Studio).
 * Advances through a list of patterns bar-by-bar on the transport's beat
 * clock. Switch events are pushed onto the Scheduler queue at their exact
 * beat position, so pattern changes land on the grid, sample-accurately
 * (same trick as ClipPlayer).
 */

import type { Scheduler } from '../audio/scheduler';
import type { Transport, Unsub } from '../audio/transport';

/** One entry in a pattern chain. Bars are whole 4/4 bars at the transport beat. */
export interface ChainStep {
  patternId: string;
  bars: number;
}

export interface ChainRunnerOptions {
  transport: Transport;
  scheduler: Scheduler;
  /** Called exactly on the bar boundary the next pattern should start. */
  onPatternChanged(patternId: string, atBeats: number): void;
}

export class ChainRunner {
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private readonly onPatternChanged: (patternId: string, atBeats: number) => void;
  private readonly unsubTick: Unsub;

  private chain: ChainStep[] = [];
  private cursor = 0;
  private nextSwitchBeat: number | null = null;

  constructor(o: ChainRunnerOptions) {
    this.transport = o.transport;
    this.scheduler = o.scheduler;
    this.onPatternChanged = o.onPatternChanged;
    this.unsubTick = this.scheduler.onTick(() => this.tick());
  }

  setChain(steps: ChainStep[]): void {
    this.chain = steps;
    this.cursor = 0;
    this.nextSwitchBeat = null;
  }

  get current(): ChainStep | null { return this.chain[this.cursor] ?? null; }
  get chainLength(): number { return this.chain.length; }

  /** Start the chain at the given transport-beat (scene start / transport start). */
  start(fromBeats: number): void {
    if (this.chain.length === 0) return;
    const first = this.chain[0];
    this.nextSwitchBeat = fromBeats + first.bars * this.transport.beatsPerBar;
  }

  /** Jump straight to a pattern by id (UI picker). */
  jumpTo(patternId: string): void {
    const idx = this.chain.findIndex((c) => c.patternId === patternId);
    if (idx < 0) return;
    this.cursor = idx;
    this.nextSwitchBeat = null;
  }

  /** Called on every scheduler tick; schedules the next switch, then advances. */
  tick(): void {
    if (this.nextSwitchBeat === null || this.chain.length === 0) return;
    const nowBeats = this.transport.nowBeats();
    if (nowBeats < this.nextSwitchBeat) return;
    const next = this.chain[(this.cursor + 1) % this.chain.length];
    const switchBeat = this.nextSwitchBeat;
    const atSec = this.transport.secOfBeat(switchBeat);
    this.scheduler.at(atSec, () => {
      this.cursor = (this.cursor + 1) % this.chain.length;
      this.onPatternChanged(this.chain[this.cursor].patternId, switchBeat);
    });
    this.nextSwitchBeat = switchBeat + next.bars * this.transport.beatsPerBar;
  }

  dispose(): void {
    this.unsubTick();
    this.chain = [];
    this.nextSwitchBeat = null;
  }
}