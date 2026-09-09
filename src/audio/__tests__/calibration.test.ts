import { describe, expect, it, vi } from 'vitest';
import { applyEq, fitEq, OCTAVE_BAND_HZ, parseRewTxt } from '../calibration';

const REW_SAMPLE = `REW Spl or Radian data
20	102.00490	-117.17
31.5	103.12	-112.3
63	101.5	-100
125	100	-92
250	102.25	-80
500	105	-60
1000	107.5	-40
2000	104	-25
4000	100.8	-10
8000	98	5
16000	96	10
`;

describe('calibration', () => {
  it('parses a REW export, keeping freqs and magnitudes in dB', () => {
    const { freqs, magsDb } = parseRewTxt(REW_SAMPLE);
    expect(freqs[0]).toBe(20);
    expect(freqs[1]).toBe(31.5);
    expect(freqs).toHaveLength(11);
    expect(magsDb[6]).toBe(107.5); // 1k row
    expect(magsDb[5]).toBe(105);   // 500 row (index = position after sort)
  });

  it('ignores non-numeric rows and radio headers, supports comma decimals', () => {
    const txt = `# comment row
RATE
13,5	99,3	-1,0
NOT NUMERIC, 3
31,5	103,1	-112,3
`;
    const r = parseRewTxt(txt);
    // 13.5 Hz is below 20 Hz → skipped; 31.5 kept with comma decimals
    expect(r.freqs).toEqual([31.5]);
    expect(r.magsDb[0]).toBeCloseTo(103.1, 4);
  });

it('fits full-octave flattening bands that complement a +6 dB shelf', () => {
  // clean shape: +6 dB shelf from 1 kHz up, everything else flat
  const freqs = OCTAVE_BAND_HZ;
  const magsDb = freqs.map((f) => (f >= 1000 ? 6 : 0));
  const bands = fitEq(magsDb, freqs);
  const wants = new Map(bands.map((b) => [b.freq, b.gainDb]));
  // median=3 dB: shelf (6 dB) → -3 dB correction, floor (0 dB) → +3 dB
  expect(wants.get(1000)).toBeCloseTo(-3, 6);
  expect(wants.get(500)).toBeCloseTo(3, 6);
  for (const b of bands) {
    expect(b.freq).toBeGreaterThanOrEqual(OCTAVE_BAND_HZ[0]);
    expect(b.freq).toBeLessThanOrEqual(OCTAVE_BAND_HZ[OCTAVE_BAND_HZ.length - 1]);
    expect(b.q).toBe(1);
  }
  // a flat response fits to NOTHING (median-normalized)
  expect(fitEq([0, 0, 0, 0, 0, 0, 0], [100, 200, 400, 800, 1600, 3200, 6400])).toEqual([]);
});

  it('shapes the graph with peaking filters and can rebuild/dispose the chain', () => {
    const ctx = {
      currentTime: 0,
      createGain: () => ({ value: 0, connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } }),
      createBiquadFilter: vi.fn(() => ({
        type: '', frequency: { value: 0 }, Q: { value: 1 }, gain: { value: 0 },
        connect: vi.fn(), disconnect: vi.fn(),
      })),
    } as unknown as AudioContext;

    const chain = applyEq(ctx, [{ freq: 1000, gainDb: -3, q: 1 }, { freq: 4000, gainDb: 2, q: 1 }]);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(2);
    const bands = chain as unknown as { setBands: (b: unknown[]) => void };
    bands.setBands([]); // no-op filters → direct input->output
    chain.dispose();
  });
});