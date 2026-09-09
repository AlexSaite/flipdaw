/** Composition root of the core engine: ctx + transport + scheduler + graph + player/strip pool
 *  + M3 services (send reverb, loop recorder, follow-actions). All M3 services are lazy. */

import { Transport } from './transport';
import { Scheduler } from './scheduler';
import { createAudioGraph, type AudioGraph, type TrackStrip } from './graph';
import { ClipPlayer } from './clipPlayer';
import { Metronome, createClickSound } from './metronome';
import { TapTempo } from './tapTempo';
import { createImpulseResponse, type ReverbBus } from './reverb';
import { Recorder, type RecorderOptions } from './recorder';
import { WorkletCapture } from './workletCapture';
import { FollowRunner, type FollowRunnerOptions } from './follow';

/** Callbacks the UI layer wants attached to the (lazily created) recorder. */
export type RecorderHooks = Pick<RecorderOptions, 'onState' | 'onBuffer'>;
/** Callbacks the UI layer wants attached to the (lazily created) follow runner. */
export type FollowHooks = Pick<FollowRunnerOptions, 'onFollow'>;

export interface Engine {
  readonly ctx: AudioContext;
  readonly transport: Transport;
  readonly scheduler: Scheduler;
  readonly graph: AudioGraph;
  readonly metronome: Metronome;
  readonly tapTempo: TapTempo;
  stripFor(trackId: string): TrackStrip;
  playerFor(cellId: string, trackId: string): ClipPlayer;
  /** Lazy send-reverb bus (wired to master). */
  getReverb(): ReverbBus;
  /** Lazy loop recorder (async: mic permission + worklet init). Callbacks bind on first call. */
  getRecorder(hooks?: RecorderHooks): Promise<Recorder>;
  /** Lazy scene follow-actions runner. Callbacks bind on first call. */
  getFollow(hooks?: FollowHooks): FollowRunner;
  panic(): void;
  resume(): Promise<void>;
}

let instance: Engine | null = null;

export function getEngine(): Engine {
  if (instance) return instance;
  return createEngine();
}

/**
 * ADR-010 swap seam: replace the engine instance wholesale (e.g. plug the
 * JUCE core client). The store keeps calling getEngine() — the UI does not
 * notice the swap. Pass `null` to restore the default engine.
 */
export function setEngineOverride(engine: Engine | null): void {
  instance = engine;
}

export function createEngine(): Engine {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const transport = new Transport(ctx, 120);
  const scheduler = new Scheduler({ clock: () => ctx.currentTime });
  scheduler.start();
  const graph = createAudioGraph(ctx);
  const metronome = new Metronome({ transport, playClick: createClickSound(ctx) });
  scheduler.onTick(() => metronome.tick(ctx.currentTime));
  const tapTempo = new TapTempo();

  const strips = new Map<string, TrackStrip>();
  const players = new Map<string, ClipPlayer>();

  let reverbBus: ReverbBus | null = null;
  let followRunner: FollowRunner | null = null;
  let recorderPromise: Promise<Recorder> | null = null;

  const engine: Engine = {
    ctx, transport, scheduler, graph, metronome, tapTempo,
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
    getReverb() {
      if (!reverbBus) {
        const impulse = createImpulseResponse(ctx, ctx.sampleRate, 2.5, 2.5);
        reverbBus = graph.createReverb(impulse);
      }
      return reverbBus;
    },
    getFollow(hooks?: FollowHooks) {
      if (!followRunner) {
        followRunner = new FollowRunner({ transport, scheduler, onFollow: hooks?.onFollow });
      }
      return followRunner;
    },
    getRecorder(hooks?: RecorderHooks) {
      if (!recorderPromise) {
        recorderPromise = createLoopRecorder(ctx, transport, scheduler, hooks);
      }
      return recorderPromise;
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

async function createLoopRecorder(
  ctx: AudioContext,
  transport: Transport,
  scheduler: Scheduler,
  hooks?: RecorderHooks,
): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = ctx.createMediaStreamSource(stream);
  const capture = await WorkletCapture.create({ ctx, input: source });
  return new Recorder({
    transport,
    scheduler,
    capture,
    now: () => ctx.currentTime,
    countInBars: 1,
    onState: hooks?.onState,
    onBuffer: hooks?.onBuffer,
  });
}

export function hasEngine(): boolean { return instance !== null; }