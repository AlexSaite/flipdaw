/** Composition root of the M0 core: ctx + transport + scheduler + graph + player/strip pool. */

import { Transport } from './transport';
import { Scheduler } from './scheduler';
import { createAudioGraph, type AudioGraph, type TrackStrip } from './graph';
import { ClipPlayer } from './clipPlayer';

export interface Engine {
  readonly ctx: AudioContext;
  readonly transport: Transport;
  readonly scheduler: Scheduler;
  readonly graph: AudioGraph;
  stripFor(trackId: string): TrackStrip;
  playerFor(cellId: string, trackId: string): ClipPlayer;
  panic(): void;
  resume(): Promise<void>;
}

let instance: Engine | null = null;

export function getEngine(): Engine {
  if (instance) return instance;
  return createEngine();
}

export function createEngine(): Engine {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const transport = new Transport(ctx, 120);
  const scheduler = new Scheduler({ clock: () => ctx.currentTime });
  scheduler.start();
  const graph = createAudioGraph(ctx);

  const strips = new Map<string, TrackStrip>();
  const players = new Map<string, ClipPlayer>();

  const engine: Engine = {
    ctx, transport, scheduler, graph,
    stripFor(trackId) {
      let s = strips.get(trackId);
      if (!s) { s = graph.createStrip(); strips.set(trackId, s); }
      return s;
    },
    playerFor(cellId, trackId) {
      let p = players.get(cellId);
      if (!p) {
        p = new ClipPlayer({ ctx, transport, scheduler, strip: this.stripFor(trackId) });
        players.set(cellId, p);
      }
      return p;
    },
    panic() {
      players.forEach((p) => p.panic());
      transport.stop();
    },
    async resume() {
      if (ctx.state !== 'running') await ctx.resume();
    },
  };

  instance = engine;
  return engine;
}

export function hasEngine(): boolean { return instance !== null; }
