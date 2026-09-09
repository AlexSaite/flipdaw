import { describe, expect, it } from 'vitest';
import { computeChops, equalChops } from '../chop';

describe('equalChops', () => {
  it('splits evenly', () => {
    const chops = equalChops(2.0, 4);
    expect(chops).toEqual([
      { start: 0, end: 0.5 },
      { start: 0.5, end: 1.0 },
      { start: 1.0, end: 1.5 },
      { start: 1.5, end: 2.0 },
    ]);
  });

  it('single chop covers the whole sample', () => {
    expect(equalChops(1.9, 1)).toEqual([{ start: 0, end: 1.9 }]);
    expect(computeChops(1.9, 0, 'equal')).toEqual([{ start: 0, end: 1.9 }]);
  });
});

describe('lazyChops', () => {
  it('computes lazily without a waveform (falls back to equal boundaries)', () => {
    const chops = computeChops(1.0, 4, 'lazy');
    expect(chops).toEqual(equalChops(1.0, 4));
  });

  it('snaps boundaries to zero crossings of the waveform', () => {
    // 100 Hz sine @ 8000 Hz → a zero crossing every 40 samples (0.005 s)
    const sr = 8000;
    const n = sr;
    const channel = new Float32Array(n);
    for (let i = 0; i < n; i++) channel[i] = Math.sin(2 * Math.PI * 100 * (i / sr));
    const chops = computeChops(1.0, 4, 'lazy', channel, sr);
    expect(chops[0].start).toBe(0);
    expect(chops[3].end).toBeCloseTo(1.0, 3);
    const ideal = [0, 0.25, 0.5, 0.75];
    const idealEnds = [0.25, 0.5, 0.75, 1.0];
    chops.forEach((c, i) => {
      expect(Math.abs(c.start - ideal[i])).toBeLessThan(0.002);
      expect(Math.abs(c.end - idealEnds[i])).toBeLessThan(0.002);
      expect(c.end).toBeGreaterThan(c.start);
    });
    // boundaries stay monotonic
    for (let i = 1; i < chops.length; i++) {
      expect(chops[i].start).toBeGreaterThanOrEqual(chops[i - 1].end - 1e-9);
    }
  });
});