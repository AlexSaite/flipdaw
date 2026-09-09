/**
 * FlipDAW — sample-trigger voice (M6.2).
 * Fires decoded AudioBuffers at exact ctx time (ADR-001). Pitch via
 * playbackRate: rate = 2^(pitch-rootNote)/12, clamped to ±24 semitones.
 * One-shots play a single pass; loops honour [loopStart,loopEnd] for one
 * pass and stop — deterministic and short, like a drum trigger. A short
 * fade-out avoids clicks at the boundary.
 */

import type { Seconds } from './transport';
import type { PadMode } from '../sampler/model';

export interface SamplerSound {
  buffer: AudioBuffer;
  mode: PadMode;
  start: number;
  end: number;
  rootNote: number;
  gain: number;
  /** MIDI note to play (chromatic apps map pads to a staircase). */
  pitch: number;
}

export interface SamplerVoice {
  trigger(s: SamplerSound, velocity: number, when: Seconds): void;
  stopAll(when: Seconds): void;
}

export function pitchRate(rootNote: number, pitch: number): number {
  const st = Math.min(24, Math.max(-24, pitch - rootNote));
  return Math.pow(2, st / 12);
}

export function createSamplerVoice(ctx: AudioContext, destination: AudioNode): SamplerVoice {
  const active = new Set<AudioBufferSourceNode>();

  function trigger(s: SamplerSound, velocity: number, when: Seconds): void {
    const buf = s.buffer;
    if (!buf || buf.duration <= 0) return;
    const start = Math.min(Math.max(0, s.start), Math.max(0, buf.duration - 0.001));
    const end = s.end > start ? Math.min(s.end, buf.duration) : buf.duration;
    const dur = end - start;
    if (dur <= 0.001) return;
    const rate = Math.max(0.05, pitchRate(s.rootNote, s.pitch));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const playSec = dur / rate;
    const endAt = when + playSec + 0.02;
    const level = Math.min(1.2, Math.max(0, velocity * s.gain));
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, when);
    g.gain.exponentialRampToValueAtTime(0.03, endAt - 0.02);
    g.gain.setValueAtTime(0.0001, endAt);
    if (s.mode === 'loop') {
      src.loop = true;
      src.loopStart = start;
      src.loopEnd = end;
      src.start(when, start);
    } else {
      src.start(when, start, playSec);
    }
    src.connect(g).connect(destination);
    src.onended = () => {
      active.delete(src);
      g.disconnect();
    };
    src.stop(endAt);
    active.add(src);
  }

  return {
    trigger,
    stopAll(when) {
      for (const src of [...active]) src.stop(when);
      active.clear();
    },
  };
}