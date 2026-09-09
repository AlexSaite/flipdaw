/**
 * FlipDAW — step-sequencer voice bus (M5.5).
 * Synthesizes a tiny drum kit (kick/snare/hat/tom) from short per-hit buffers,
 * one fire-and-forget BufferSourceNode per hit, gain scaled by velocity. All
 * voices route into the passed destination (a track strip) so the sequencer
 * sits in the same mix as looped clips.
 *
 * Level design: the kit is synthesized, so its raw peak is far below a WAV
 * sample. Every hit goes through a fixed stage gain + a soft compressor, so
 * even dense poly-rhythms (ratchets, flams) land at a comparable loudness
 * without hard clipping.
 */

import type { StepVoiceBus } from '../sequencer/stepSequencer';

function noise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    d[i] = 0.9 * (s = (s * 0.997) + (Math.random() * 2 - 1) * 0.05); // whitened noise
  }
  return buf;
}

function decay(data: Float32Array, k: number): void {
  const n = data.length;
  for (let i = 0; i < n; i++) data[i] *= Math.pow(1 - i / n, k);
}

/** Normalise to a fixed peak so kick/snare/hat have consistent loudness. */
function normalizePeak(data: Float32Array, peak = 0.9): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > max) max = a;
  }
  if (max === 0) return;
  const k = peak / max;
  for (let i = 0; i < data.length; i++) data[i] *= k;
}

function sineSweep(ctx: AudioContext, f0: number, f1: number, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / ctx.sampleRate;
    phase += 2 * Math.PI * (f0 + (f1 - f0) * (t / seconds)) / ctx.sampleRate;
    d[i] = Math.sin(phase);
  }
  normalizePeak(d);
  return buf;
}

export interface StepVoiceBusOptions {
  /** Stage gain applied to every hit before the comp (loudness balance). */
  level?: number;
}

export function createStepVoiceBus(
  ctx: AudioContext,
  destination: AudioNode,
  opts: StepVoiceBusOptions = {},
): StepVoiceBus {
  const level = ctx.createGain();
  level.gain.value = opts.level ?? 2.0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 12;
  comp.ratio.value = 8;
  comp.attack.value = 0.001;
  comp.release.value = 0.15;
  level.connect(comp).connect(destination);

  const cache = new Map<string, AudioBuffer>();

  function bufferFor(sourceId: string): AudioBuffer {
    const hit = cache.get(sourceId);
    if (hit) return hit;
    let buf: AudioBuffer;
    switch (sourceId) {
      case 'kick':
        buf = sineSweep(ctx, 160, 40, 0.14);
        break;
      case 'snare': {
        buf = noise(ctx, 0.18);
        decay(buf.getChannelData(0), 4);
        normalizePeak(buf.getChannelData(0));
        break;
      }
      case 'hat': {
        buf = noise(ctx, 0.05);
        decay(buf.getChannelData(0), 3);
        normalizePeak(buf.getChannelData(0));
        break;
      }
      case 'tom':
        buf = sineSweep(ctx, 220, 120, 0.22);
        break;
      default:
        buf = sineSweep(ctx, 660, 330, 0.06);
    }
    cache.set(sourceId, buf);
    return buf;
  }

  return {
    play(sourceId, at, velocity) {
      const src = ctx.createBufferSource();
      src.buffer = bufferFor(sourceId);
      const g = ctx.createGain();
      g.gain.setValueAtTime(velocity, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.31);
      src.connect(g).connect(level);
      src.start(at);
    },
  };
}