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
  MAX_ROWS,
} from '../model';
import { mulberry32 } from '../stepSequencer';

const R0 = 0; // kick row

describe('sequencer model', () => {
  it('creates a 16-row × 16-step pattern; steps are off by default', () => {
    const p = createPattern('hats', 'Hats', 16);
    expect(p.rows).toHaveLength(MAX_ROWS);
    expect(p.length).toBe(16);
    expect(p.rows[0].kind).toBe('synth');
    expect(p.rows.every((row) => row.steps.length === 32)).toBe(true);
    expect(p.rows.every((row) => row.steps.every((c) => c.on === false))).toBe(true);
  });

  it('toggles and cycles velocity with wrap to off, per row', () => {
    const p = createPattern('kick');
    toggleStep(p, R0, 0);
    expect(stepAt(p, R0, 0).on).toBe(true);
    expect(stepAt(p, R0, 0).velocity).toBe(1);
    toggleStep(p, 4, 0);
    expect(stepAt(p, 4, 0).on).toBe(true); // another row, same column
    cycleVelocity(p, R0, 0);
    expect(stepAt(p, R0, 0).velocity).toBe(0.75);
    expect(stepAt(p, 4, 0).velocity).toBe(1); // untouched
    cycleVelocity(p, R0, 0);
    cycleVelocity(p, R0, 0);
    expect(stepAt(p, R0, 0).velocity).toBe(0.25);
    cycleVelocity(p, R0, 0);
    expect(stepAt(p, R0, 0).on).toBe(false);
  });

  it('clamps flam/ratchet/probability via patchCell', () => {
    const p = createPattern('x');
    toggleStep(p, R0, 5);
    patchCell(p, R0, 5, { flam: 9, ratchet: 99, probability: 2 });
    expect(stepAt(p, R0, 5).flam).toBe(2);
    expect(stepAt(p, R0, 5).ratchet).toBe(4);
    expect(stepAt(p, R0, 5).probability).toBe(1);
    patchCell(p, R0, 5, { ratchet: 0, probability: -1 });
    expect(stepAt(p, R0, 5).ratchet).toBe(1);
  });

  it('handles wraps beyond length and resize disables trimmed steps', () => {
    const p = createPattern('bass');
    toggleStep(p, R0, 15);
    expect(stepAt(p, R0, 15).on).toBe(true);
    expect(stepAt(p, R0, -1).on).toBe(true); // wraps
    setLength(p, 8);
    expect(stepAt(p, R0, 15).on).toBe(false); // outside 8 → re-smaps to 7
    clearPattern(p);
    expect(p.rows.some((row) => row.steps.some((c) => c.on))).toBe(false);
  });

  it('randomize is deterministic with a seeded rng and serializes cleanly', () => {
    const a = createPattern('a');
    const b = createPattern('b');
    randomizePattern(a, mulberry32(42));
    randomizePattern(b, mulberry32(42));
    expect(a.rows.map((r) => r.steps.map((c) => c.on))).toEqual(
      b.rows.map((r) => r.steps.map((c) => c.on)),
    );
    const snap = serializePattern(a);
    expect(snap.rows).toHaveLength(MAX_ROWS);
    expect(snap.rows[0].steps).toHaveLength(a.length);
    expect(snap.rows[0].steps[0]).toEqual(a.rows[0].steps[0]);
  });
});