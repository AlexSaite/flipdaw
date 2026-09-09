import { describe, expect, it } from 'vitest';
import {
  computePeaks, peaksToJson, peaksFromJson,
  PEAKS_VERSION, drawPeaks,
} from '../thumbs';

describe('computePeaks', () => {
  it('produces buckets of min/max for mono', () => {
    // Build a synthetic AudioBuffer-compatible object
    const channels = [new Float32Array([0.5, -0.5, 0.3, -0.3, 0.1, -0.1, 0.9, -0.9])];
    const buf = {
      numberOfChannels: 1,
      length: 8,
      duration: 1,
      getChannelData: (c: number) => channels[c],
    } as unknown as AudioBuffer;

    const p = computePeaks(buf, 4);
    expect(p.version).toBe(PEAKS_VERSION);
    expect(p.length).toBe(4);
    expect(p.duration).toBe(1);
    // bucket 0: samples [0.5, -0.5] -> min -0.5 (idx0), max 0.5 (idx1)
    expect(Math.abs(p.channels[0][0] + 0.5)).toBeLessThan(1e-6);
    expect(Math.abs(p.channels[0][1] - 0.5)).toBeLessThan(1e-6);
    // bucket 3: samples [0.9, -0.9]
    expect(Math.abs(p.channels[0][6] + 0.9)).toBeLessThan(1e-6);
    expect(Math.abs(p.channels[0][7] - 0.9)).toBeLessThan(1e-6);
  });

  it('handles stereo via multiple channels', () => {
    const buf = {
      numberOfChannels: 2,
      length: 4,
      duration: 1,
      getChannelData: (c: number) => (c === 0
        ? new Float32Array([0.5, -0.5, 0.5, -0.5])
        : new Float32Array([0.2, -0.2, 0.2, -0.2])),
    } as unknown as AudioBuffer;
    const p = computePeaks(buf, 4);
    expect(p.channels.length).toBe(2);
  });

  it('empty channel does not crash and keeps length', () => {
    const buf = {
      numberOfChannels: 1,
      length: 0,
      duration: 0,
      getChannelData: () => new Float32Array(0),
    } as unknown as AudioBuffer;
    const p = computePeaks(buf, 10);
    expect(p.length).toBe(10);
  });
});

describe('peaks JSON round-trip', () => {
  it('round-trips values', () => {
    const ch = new Float32Array([0.25, -0.25, 0.75, -0.75]);
    const peaks = { version: PEAKS_VERSION, length: 2, duration: 0.5, channels: [ch] };
    const text = peaksToJson(peaks);
    const back = peaksFromJson(text);
    expect(back).not.toBeNull();
    expect(back!.duration).toBe(0.5);
    expect(Array.from(back!.channels[0])).toEqual([0.25, -0.25, 0.75, -0.75]);
  });

  it('returns null for wrong version', () => {
    const text = JSON.stringify({ version: 99, length: 1, duration: 1, channels: [[0, 1]] });
    expect(peaksFromJson(text)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(peaksFromJson('not json')).toBeNull();
  });
});

describe('drawPeaks', () => {
  it('runs without throwing (canvas mock)', () => {
    const lines: number[] = [];
    const ctx = {
      clearRect: () => {},
      beginPath: () => {},
      moveTo: (x: number, y: number) => lines.push(x, y),
      lineTo: (x: number, y: number) => lines.push(x, y),
      stroke: () => {},
      strokeStyle: '',
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    const p = { version: PEAKS_VERSION, length: 2, duration: 1, channels: [new Float32Array([-1, 1, -0.5, 0.5])] };
    expect(() => drawPeaks(ctx, p, 100, 50)).not.toThrow();
    expect(lines.length).toBeGreaterThan(0);
  });
});
