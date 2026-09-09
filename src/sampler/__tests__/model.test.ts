import { describe, expect, it } from 'vitest';
import { createPad, padWindow, SAMPLER_PADS } from '../model';

describe('sampler model', () => {
  it('creates 8 fresh pads with sane defaults', () => {
    const pads = Array.from({ length: SAMPLER_PADS }, (_, i) => createPad(`s${i}`, i));
    expect(pads).toHaveLength(8);
    const p = pads[0];
    expect(p).toMatchObject({
      id: 's0', name: 'Pad 1', file: '', buffer: null, mode: 'loop',
      start: 0, end: 0, rootNote: 60, gain: 0.9,
    });
  });

  it('padWindow resolves end=0 to the buffer duration and clamps', () => {
    const pad = createPad('s0', 0);
    pad.buffer = { duration: 3.5 } as AudioBuffer;
    expect(padWindow(pad)).toEqual({ start: 0, end: 3.5 });

    pad.start = 0.5; pad.end = 4;
    expect(padWindow(pad)).toEqual({ start: 0.5, end: 3.5 });

    pad.start = 9;
    expect(padWindow(pad).start).toBe(3.5);
  });
});