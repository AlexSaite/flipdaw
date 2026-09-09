import { describe, expect, it } from 'vitest';
import {
  clearPattern,
  createPattern,
  cycleVelocity,
  patchCell,
  randomizePattern,
  serializePattern,
  setLength,
  stepAt,
  toggleStep,
} from '../model';
import { mulberry32 } from '../stepSequencer';

describe('sequencer model', () => {
  it('creates a 16-step pattern; steps are off by default', () => {
    const p = createPattern('hats', 'Hats', 16);
    expect(p.steps).toHaveLength(32);
    expect(p.length).toBe(16);
    expect(p.steps.map((c) => c.on)).toEqual(Array(32).fill(false));
  });

  it('toggles and cycles velocity with wrap to off', () => {
    const p = createPattern('kick');
    toggleStep(p, 0);
    expect(stepAt(p, 0).on).toBe(true);
    expect(stepAt(p, 0).velocity).toBe(1);
    cycleVelocity(p, 0);
    expect(stepAt(p, 0).velocity).toBe(0.75);
    cycleVelocity(p, 0);
    cycleVelocity(p, 0);
    expect(stepAt(p, 0).velocity).toBe(0.25);
    cycleVelocity(p, 0);
    expect(stepAt(p, 0).on).toBe(false);
  });

  it('clamps flam/ratchet/probability via patchCell', () => {
    const p = createPattern('x');
    toggleStep(p, 5);
    patchCell(p, 5, { flam: 9, ratchet: 99, probability: 2 });
    expect(stepAt(p, 5).flam).toBe(2);
    expect(stepAt(p, 5).ratchet).toBe(4);
    expect(stepAt(p, 5).probability).toBe(1);
    patchCell(p, 5, { ratchet: 0, probability: -1 });
    expect(stepAt(p, 5).ratchet).toBe(1);
  });

  it('handles wraps beyond length and resize disables trimmed steps', () => {
    const p = createPattern('bass');
    toggleStep(p, 15);
    expect(stepAt(p, 15).on).toBe(true);
    expect(stepAt(p, -1).on).toBe(true); // wraps
    setLength(p, 8);
    expect(stepAt(p, 15).on).toBe(false); // outside 8 → re-smaps to 7
    clearPattern(p);
    expect(p.steps.some((c) => c.on)).toBe(false);
  });

  it('randomize is deterministic with a seeded rng and serializes cleanly', () => {
    const a = createPattern('a');
    const b = createPattern('b');
    randomizePattern(a, mulberry32(42));
    randomizePattern(b, mulberry32(42));
    expect(a.steps.map((c) => c.on)).toEqual(b.steps.map((c) => c.on));
    const snap = serializePattern(a);
    expect(snap.steps).toHaveLength(a.length);
    expect(snap.steps[0]).toEqual(a.steps[0]);
  });
});