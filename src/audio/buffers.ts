/**
 * FlipDAW — buffer utilities for loop recording.
 * mergeBuffers/trimBuffer are pure sample math over channel data, so they are
 * unit-testable without a real AudioContext (ADR-001: no wall-clock in math).
 */

import type { Seconds } from './transport';

const EPS_BARS = 1e-6;

/** Loop length (sec) that snaps UP to a whole number of bars at current tempo. */
export function snapToBars(durationSec: Seconds, bpm: number, beatsPerBar: number): Seconds {
  const secPerBar = (beatsPerBar * 60) / bpm;
  const bars = Math.max(1, Math.ceil(durationSec / secPerBar - EPS_BARS));
  return bars * secPerBar;
}

/** Sample count for a duration at a sample rate (sample-accurate). */
export function samplesOf(durationSec: Seconds, sampleRate: number): number {
  return Math.max(1, Math.round(durationSec * sampleRate));
}

/**
 * Overdub: overlay `add` onto `base` at `offsetSec`, clipping to [-1, 1].
 * Returns a new AudioBuffer with channelCount = max of the two.
 */
export function mergeBuffers(
  ctx: Pick<AudioContext, 'createBuffer'>,
  base: AudioBuffer,
  add: AudioBuffer,
  offsetSec: Seconds,
): AudioBuffer {
  const sampleRate = base.sampleRate;
  const channels = Math.max(base.numberOfChannels, add.numberOfChannels);
  const length = base.length;
  const out = ctx.createBuffer(channels, length, sampleRate);
  const empty = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const baseData = c < base.numberOfChannels ? base.getChannelData(c) : empty;
    const dst = out.getChannelData(c);
    dst.set(baseData);
    if (c < add.numberOfChannels) {
      const a = add.getChannelData(c);
      const offset = Math.round(offsetSec * sampleRate);
      for (let i = 0; i < a.length; i++) {
        const j = i + offset;
        if (j >= 0 && j < length) {
          const s = dst[j] + a[i];
          dst[j] = s > 1 ? 1 : s < -1 ? -1 : s;
        }
      }
    }
  }
  return out;
}

/** Trim a recorded buffer to [startSec, endSec), creating a new AudioBuffer. */
export function trimBuffer(
  ctx: Pick<AudioContext, 'createBuffer'>,
  buf: AudioBuffer,
  startSec: Seconds,
  endSec: Seconds,
): AudioBuffer {
  const sampleRate = buf.sampleRate;
  const total = buf.length;
  const start = Math.max(0, Math.round(startSec * sampleRate));
  const end = Math.min(total, Math.round(endSec * sampleRate));
  const length = Math.max(1, end - start);
  const channels = buf.numberOfChannels;
  const out = ctx.createBuffer(channels, length, sampleRate);
  for (let c = 0; c < channels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(start, end));
  }
  return out;
}