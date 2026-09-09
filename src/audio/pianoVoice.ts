/**
 * FlipDAW — synth piano voice (M6.1).
 * Strikes a note as a bank of five inharmonic sine partials with slight
 * detunes; velocity scales both level and brightness. No sample assets.
 * Scheduling is sample-accurate (ADR-001): every event takes a `when` in
 * AudioContext.currentTime. noteOff shortens the decay; retriggering a note
 * cuts the previous voice like a mechanical piano hammer.
 */

import type { Seconds } from './transport';

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const PARTIALS = [
  { ratio: 1, amp: 1.0, det: 0 },
  { ratio: 2, amp: 0.38, det: 0.8 },
  { ratio: 3, amp: 0.15, det: 1.4 },
  { ratio: 4, amp: 0.062, det: -2.2 },
  { ratio: 5, amp: 0.03, det: 3.0 },
] as const;

const BASE_LEVEL = 0.16;
const VELOCITY_LEVEL = 0.5;
const NATURAL_DECAY = 2.6;
const RELEASE_SEC = 0.16;

export interface PianoVoice {
  noteOn(note: number, velocity: number, when: Seconds): void;
  noteOff(note: number, when: Seconds): void;
  allOff(when: Seconds): void;
}

interface Voice {
  g: GainNode;
  level: number;
  parts: { osc: OscillatorNode; node: GainNode; amp: number }[];
}

export function createPianoVoice(ctx: AudioContext, destination: AudioNode): PianoVoice {
  const active = new Map<number, Voice>();

  function stopVoice(note: number, when: Seconds): void {
    const v = active.get(note);
    if (!v) return;
    active.delete(note);
    v.g.gain.setValueAtTime(v.level, when);
    v.g.gain.exponentialRampToValueAtTime(0.0001, when + RELEASE_SEC);
    for (const { osc, node, amp } of v.parts) {
      node.gain.setValueAtTime(amp, when);
      node.gain.exponentialRampToValueAtTime(0.0001, when + RELEASE_SEC);
      osc.stop(when + RELEASE_SEC + 0.01);
    }
  }

  function noteOn(note: number, velocity: number, when: Seconds): void {
    stopVoice(note, when);
    const level = BASE_LEVEL + VELOCITY_LEVEL * velocity;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + NATURAL_DECAY);
    g.connect(destination);
    const f0 = midiToFreq(note);
    const parts = PARTIALS.map((p) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f0 * p.ratio;
      osc.detune.value = p.det;
      const node = ctx.createGain();
      const amp = p.amp * (1 + 0.7 * velocity);
      node.gain.setValueAtTime(amp, when);
      node.gain.exponentialRampToValueAtTime(0.0001, when + NATURAL_DECAY);
      osc.connect(node).connect(g);
      osc.start(when);
      osc.stop(when + NATURAL_DECAY + 0.05);
      return { osc, node, amp };
    });
    active.set(note, { g, level, parts });
  }

  function noteOff(note: number, when: Seconds): void {
    stopVoice(note, when);
  }

  function allOff(when: Seconds): void {
    for (const note of [...active.keys()]) stopVoice(note, when);
  }

  return { noteOn, noteOff, allOff };
}