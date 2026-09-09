import { describe, expect, it } from 'vitest';
import { createSamplerVoice, pitchRate, type SamplerSound } from '../samplerVoice';

interface FakeSource {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  startCalls: { when: number; offset?: number; dur?: number }[];
  stopCalls: number[];
  onended: (() => void) | null;
  connect(dest: unknown): unknown;
}

function makeFakeCtx() {
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 0,
    createBufferSource(): FakeSource {
      const s: FakeSource = {
        buffer: null,
        playbackRate: { value: 1 },
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        startCalls: [],
        stopCalls: [],
        onended: null,
        connect: (dest: unknown) => dest,
      };
      const withApi: FakeSource & { start(...a: number[]): void; stop(t: number): void } = {
        ...s,
        start(...args: number[]) { s.startCalls.push({ when: args[0], offset: args[1], dur: args[2] }); },
        stop(t: number) { s.stopCalls.push(t); },
      };
      sources.push(withApi);
      return withApi;
    },
    createGain() {
      const node = {
        gain: {
          value: 0,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          cancelScheduledValues() {},
        },
        disconnect() {},
        connect: (dest: unknown) => dest,
      };
      return node as unknown as GainNode;
    },
  } as unknown as AudioContext;
  return { ctx, sources };
}

const buffer = { duration: 2.0 } as AudioBuffer;
const sound = (over: Partial<SamplerSound> = {}): SamplerSound => ({
  buffer,
  mode: 'oneshot',
  start: 0.5,
  end: 1.5,
  rootNote: 60,
  gain: 1,
  pitch: 72,
  ...over,
});

describe('samplerVoice', () => {
  it('fires a one-shot at the exact offset, scaled by playbackRate', () => {
    const { ctx, sources } = makeFakeCtx();
    const voice = createSamplerVoice(ctx, {} as unknown as AudioNode);
    voice.trigger(sound(), 0.8, 100.0);
    expect(sources).toHaveLength(1);
    const src = sources[0];
    expect(src.playbackRate.value).toBe(2); // 72 vs root 60 → +12 st
    expect(src.startCalls).toEqual([{ when: 100.0, offset: 0.5, dur: 0.5 }]); // dur/rate
    expect(src.loop).toBe(false);
    expect(src.stopCalls[0]).toBeGreaterThan(100.0);
    expect(src.buffer).toBe(buffer);
  });

  it('loop mode wraps [loopStart, loopEnd] for one pass', () => {
    const { ctx, sources } = makeFakeCtx();
    const voice = createSamplerVoice(ctx, {} as unknown as AudioNode);
    voice.trigger(sound({ mode: 'loop', start: 0, end: 2, pitch: 60 }), 1, 5.0);
    const src = sources[0];
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(0);
    expect(src.loopEnd).toBe(2);
    expect(src.startCalls).toEqual([{ when: 5.0, offset: 0 }]);
    expect(src.stopCalls[0]).toBeCloseTo(5.0 + 2.0 + 0.02, 6);
  });

  it('clamps chromatic range to ±24 semitones', () => {
    expect(pitchRate(60, 84)).toBe(4);   // +24
    expect(pitchRate(60, 100)).toBe(4);  // clamped from 40
    expect(pitchRate(60, 36)).toBeCloseTo(0.25, 6); // -24
    expect(pitchRate(60, 20)).toBeCloseTo(0.25, 6); // clamped
    expect(pitchRate(60, 60)).toBe(1);
  });

  it('stopAll cuts every active source at `when`', () => {
    const { ctx, sources } = makeFakeCtx();
    const voice = createSamplerVoice(ctx, {} as unknown as AudioNode);
    voice.trigger(sound(), 1, 1.0);
    voice.trigger(sound({ pitch: 64 }), 1, 1.0);
    voice.stopAll(200.0);
    expect(sources).toHaveLength(2);
    expect(sources[0].stopCalls.includes(200.0)).toBe(true);
    expect(sources[1].stopCalls.includes(200.0)).toBe(true);
  });
});