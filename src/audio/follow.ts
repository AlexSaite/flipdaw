/**
 * FlipDAW — scene follow-actions. When a scene starts playing, schedule a
 * follow action on a bar boundary:
 *   'next'      → advance to the next scene
 *   'stop'      → stop everything
 *   afterBars N → advance N bars later
 * Scheduling happens on the audio scheduler (exact bars, no setTimeout),
 * so transitions are sample-accurate (ADR-001).
 */

import type { EventHandle, Scheduler } from './scheduler';
import type { Seconds, Transport } from './transport';

export type FollowAction =
  | { type: 'next' }
  | { type: 'stop' }
  | { type: 'afterBars'; bars: number };

export type FollowEvent = FollowAction & { scene: string };

export interface FollowRunnerOptions {
  transport: Transport;
  scheduler: Scheduler;
  onFollow?: (ev: FollowEvent) => void;
}

const DEFAULT_BARS = 1;

export class FollowRunner {
  private readonly transport: Transport;
  private readonly scheduler: Scheduler;
  private readonly onFollow: (ev: FollowEvent) => void;

  private actions = new Map<string, FollowAction>();
  private handle: EventHandle | null = null;
  private activeScene: string | null = null;

  constructor(o: FollowRunnerOptions) {
    this.transport = o.transport;
    this.scheduler = o.scheduler;
    this.onFollow = o.onFollow ?? (() => {});
  }

  get currentScene(): string | null { return this.activeScene; }

  /** Configure the follow action for a scene (replaces previous). */
  setAction(scene: string, action: FollowAction): void {
    this.actions.set(scene, action);
  }

  removeAction(scene: string): void {
    this.actions.delete(scene);
  }

  clear(): void {
    this.handle?.cancel();
    this.handle = null;
    this.activeScene = null;
  }

  /** Bars until the scheduled action fires (for UI), null if none scheduled. */
  barsUntilNext(): number | null {
    return this.actions.has(this.activeScene ?? '') ? this.delayBars(this.actions.get(this.activeScene ?? '') as FollowAction) : null;
  }

  /** Call when a scene starts playing at its exact bar boundary (atSec). */
  sceneStarted(scene: string, atSec: Seconds): void {
    this.activeScene = scene;
    this.handle?.cancel();
    const action = this.actions.get(scene);
    if (!action) {
      this.handle = null;
      return;
    }
    const fireAt = this.fireAt(action, atSec);
    this.handle = this.scheduler.at(fireAt, () => {
      this.activeScene = null;
      this.handle = null;
      this.onFollow({ ...action, scene });
    });
  }

  /** ctx-time the action for `action` fires when scene started at `atSec`. */
  fireAt(action: FollowAction, atSec: Seconds): Seconds {
    const secPerBar = (this.transport.beatsPerBar * 60) / this.transport.bpm;
    return atSec + this.delayBars(action) * secPerBar;
  }

  private delayBars(action: FollowAction): number {
    switch (action.type) {
      case 'afterBars': return Math.max(1, action.bars);
      default: return DEFAULT_BARS;
    }
  }
}