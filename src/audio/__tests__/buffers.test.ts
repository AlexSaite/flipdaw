import { describe, expect, it } from 'vitest';
import { snapToBars, samplesOf, mergeBuffers, trimBuffer } from '../buffers';

interface FakeBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(c: number): Float32Array;
}

function makeBuffer(sampleRate: number, channels: number, data: Float32Array[]): FakeBuffer {
  return {
    sampleRate,
    numberOfChannels: channels,
    length: data[0].length,
    getChannelData: (c) => data[c],
  };
}

const ctx = {
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = new Array<Float32Array>(channels);
    return {
      sampleRate, numberOfChannels: channels, length,
      getChannelData(c: number): Float32Array {
        data[c] ||= new Float32Array(length);
        return data[c];
      },
    } as unknown as AudioBuffer;
  },
} as Pick<AudioContext, 'createBuffer'>;

describe('buffers (recording utilities)', () => {
  it('snapToBars rounds up to a whole bar', () => {
    // 120 bpm, 4/4 → 2s per bar
    expect(snapToBars(3.0, 120, 4)).toBeCloseTo(4.0, 9);
    expect(snapToBars(2.0, 120, 4)).toBeCloseTo(2.0, 9);
    expect(snapToBars(0.1, 120, 4)).toBeCloseTo(2.0, 9); // min 1 bar
  });

  it('samplesOf is sample-exact', () => {
    expect(samplesOf(2.0, 48000)).toBe(96000);
    expect(samplesOf(0.001, 48000)).toBe(48);
  });

  it('mergeBuffers overdubs an added buffer at an offset with clipping', () => {
    const base = makeBuffer(1, 1, [new Float32Array([0.5, 0.5, 0.5, 0.5])]);
    const add = makeBuffer(1, 1, [new Float32Array([0.4, 0.8, 0.9])]);
    const out = mergeBuffers(ctx, base as AudioBuffer, add as AudioBuffer, 1.0);
    expect(out.numberOfChannels).toBe(1);
    expect(out.length).toBe(4);
    const d = out.getChannelData(0);
    expect(d[0]).toBeCloseTo(0.5, 6);
    expect(d[1]).toBeCloseTo(0.9, 6);
    expect(d[2]).toBeCloseTo(1.0, 6); // 1.3 clipped → 1.0
    expect(d[3]).toBeCloseTo(1.0, 6); // 1.4 clipped → 1.0
  });

  it('mergeBuffers keeps base when added buffer is shorter (no overflow)', () => {
    const sr = 4;
    const base = makeBuffer(sr, 1, [new Float32Array([0.1, 0.1, 0.1, 0.1])]);
    const add = makeBuffer(sr, 1, [new Float32Array([0.1])]);
    const out = mergeBuffers(ctx, base as AudioBuffer, add as AudioBuffer, 0.0);
    const d = out.getChannelData(0);
    expect(d[0]).toBeCloseTo(0.2, 6);
    expect(d[1]).toBeCloseTo(0.1, 6);
  });

  it('trimBuffer cuts to [startSec, endSec)', () => {
    const src = makeBuffer(1, 1, [new Float32Array([0, 1, 2, 3, 4, 5, 6, 7])]);
    const out = trimBuffer(ctx, src as AudioBuffer, 1.0, 3.0);
    expect(out.length).toBe(2);
    expect(Array.from(out.getChannelData(0))).toEqual([1, 2]);
  });
});