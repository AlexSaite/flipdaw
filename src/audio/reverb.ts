/**
 * FlipDAW — send reverb. ConvolverNode with a synthesized exponentially-
 * decaying noise impulse (stereo-decorrelated for natural widening).
 * Strips route a pre-fader send into `input`; `output` is wired to master
 * by the graph. No performance.now() in the audio path (ADR-001).
 */

import type { Seconds } from './transport';

export interface ReverbBus {
  readonly input: GainNode;
  readonly output: GainNode;
  /** Overall reverb level (the wet return), 0..1. */
  setLevel(v: number): void;
  dispose(): void;
}

/** Deterministic pseudo-random (xorshift) so impulse is reproducible in tests. */
function rand(seed: number, i: number): number {
  let x = (seed ^ (i << 13)) >>> 0;
  x = Math.imul(x, 1597334677) >>> 0;
  x ^= Math.imul(Math.imul(x >>> 16, x >>> 16), 734487981) >>> 0;
  return (x >>> 0) / 4294967296;
}

/** Pure impulse generation: exponentially-decaying noise written into `data`. */
export function generateImpulse(data: Float32Array, decay: number, seed = 42): void {
  for (let i = 0; i < data.length; i++) {
    const n = rand(seed, i) * 2 - 1;
    const env = Math.pow(1 - i / data.length, decay);
    data[i] = n * env;
  }
}

/** Build a stereo impulse response AudioBuffer. */
export function createImpulseResponse(
  ctx: Pick<AudioContext, 'createBuffer'>,
  sampleRate: number,
  seconds: Seconds,
  decay: number,
): AudioBuffer {
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const buf = ctx.createBuffer(2, length, sampleRate);
  generateImpulse(buf.getChannelData(0), decay, 1234);
  generateImpulse(buf.getChannelData(1), decay, 5678);
  return buf;
}

export interface CreateReverbBusOptions {
  level?: number; // 0..1 default 0.15
}

/** Send-reverb bus: input → convolver → wet → output (no dry tap). */
export function createReverbBus(
  ctx: Pick<AudioContext, 'createConvolver' | 'createGain' | 'currentTime'>,
  impulse: AudioBuffer,
  opts: CreateReverbBusOptions = {},
): ReverbBus {
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = opts.level ?? 0.15;
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);
  return {
    input,
    output,
    setLevel(v: number) {
      wet.gain.setTargetAtTime(Math.min(1, Math.max(0, v)), ctx.currentTime, 0.01);
    },
    dispose() {
      input.disconnect();
      convolver.disconnect();
      wet.disconnect();
      output.disconnect();
    },
  };
}