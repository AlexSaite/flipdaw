import { describe, expect, it } from 'vitest';
import { Transport } from '../../audio/transport';
import { Scheduler } from '../../audio/scheduler';
import { createPattern, type SeqPattern, type StepCell } from '../model';
import { FLAM_SEC, StepSequencer, mulberry32 } from '../stepSequencer';
import type { Hit } from '../stepSequencer';
import { createMockClock } from '../../audio/__tests__/mockClock';

function onSteps(indices: number[], patch: Partial<StepCell> = {}): StepCell[] {
  const cells = Array.from({ length: 32 }, () => ({
    on: false, velocity: 1, flam: 0, ratchet: 1, probability: 1,
  }));
  for (const i of indices) cells[i] = { ...cells[i], ...patch, on: true };
  return cells;
}

/** Set row r (default: row 0 = kick) to the given on-pattern. */
function patchRow(p: SeqPattern, r: number, indices: number[], patch: Partial<StepCell> = {}): void {
  p.rows[r].steps = onSteps(indices, patch);
}

function setup(pattern: SeqPattern) {
  const clock = createMockClock(0);
  const tr = new Transport(clock, 120); // 16th = 0.125 s
  const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
  const hits: Hit[] = [];
  const seq = new StepSequencer({
    transport: tr,
    scheduler: sch,
    now: () => clock.currentTime,
    pattern,
    voice: {
      play: (src, at, velocity) => hits.push({ at, velocity, src }),
      setSample: () => {},
    },
    rng: () => 0.99, // near-1 rng: probability gates work, jitter ≈ none
  });
  return { clock, tr, sch, seq, hits };
}

describe('StepSequencer', () => {
  it('schedules 16ths on the grid, sample-accurate, no doubles', () => {
    const p = createPattern('d', 'D', 4);
    patchRow(p, 0, [0, 1, 2, 3]);
    const { clock, tr, sch, hits } = setup(p);
    tr.start();
    clock.set(0.10); sch.tick(); // ord 1 (0.125 s) and ord 2 (0.25 s) enter horizon
    clock.set(0.20); sch.tick(); // ord 3 (0.375 s)
    clock.set(0.30); sch.tick(); // ord 4 → step 0 (0.5 s)
    clock.set(0.50); sch.tick(); // fires 0.125/0.25/0.375 + ord5 (0.625)
    // times drained so far: only those already reached
    const ats = hits.map((h) => h.at);
    expect(ats).toContain(0.125);
    expect(ats).toContain(0.25);
    expect(ats).toContain(0.375);
    expect(new Set(ats).size).toBe(ats.length); // no double-scheduling

    clock.set(0.625); sch.tick();
    expect(hits.map((h) => h.at)).toContain(0.5);  // step 0 loops back
    expect(hits.map((h) => h.at)).toContain(0.625);
  });

  it('fires every instrument row on its own step, each with its own sound', () => {
    const p = createPattern('grid', 'Grid', 4);
    patchRow(p, 0, [0]);      // kick on step 0
    patchRow(p, 1, [1]);      // snare on step 1
    patchRow(p, 2, [2]);      // hat on step 2
    patchRow(p, 3, [3]);      // tom on step 3 (default row voice)
    const { clock, tr, sch, hits } = setup(p);
    tr.start();
    clock.set(0.05); sch.tick(); // schedules ord 1 (0.125)
    clock.set(0.15); sch.tick(); // schedules ord 2 (0.25)
    clock.set(0.30); sch.tick(); // schedules ord 3 (0.375) + drains 1 & 2
    clock.set(0.50); sch.tick(); // schedules ord 4 (0.5) + drains 3 & 4
    const byStep = Object.fromEntries(hits.map((h) => [h.at, h.src]));
    expect(byStep[0.125]).toBe('snare'); // ord 1 → step 1 (row 1)
    expect(byStep[0.25]).toBe('hat');    // ord 2 → step 2 (row 2)
    expect(byStep[0.375]).toBe('tom');   // ord 3 → step 3 (row 3)
    expect(byStep[0.5]).toBe('kick');    // ord 4 → step 0 wrap (row 0)
  });

  it('swing delays only odd steps by a third of a step', () => {
    const p = createPattern('sw', 'Swing', 4);
    patchRow(p, 0, [0, 1]);
    p.swing = 1;
    const { clock, tr, sch, hits } = setup(p);
    tr.start();
    clock.set(0.05); sch.tick();
    clock.set(0.05 + 0.125); sch.tick();
    clock.set(0.25); sch.tick();
    clock.set(0.5); sch.tick();
    clock.set(0.75); sch.tick();
    const swing = 0.125 / 3;
    expect(hits[0].at).toBeCloseTo(0.125 + swing, 6); // step 1 → delayed
    expect(hits[1].at).toBeCloseTo(0.5, 6);           // step 0 (even, bar start) → on grid
  });

  it('probability gates hits deterministically', () => {
    const p = createPattern('pr', 'Prob', 4);
    patchRow(p, 0, [0], { probability: 0.5 });
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const hits: Hit[] = [];
    const rngSeq = mulberry32(7);
    new StepSequencer({
      transport: tr, scheduler: sch, now: () => clock.currentTime, pattern: p,
      voice: { play: (_s, at, v) => hits.push({ at, velocity: v }), setSample: () => {} },
      rng: rngSeq,
    });
    tr.start();
    for (let k = 0; k < 12; k++) { clock.set(0.05 + k * 0.5); sch.tick(); }
    clock.set(10); sch.tick(); // drain all fire
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(12); // ~half skipped, deterministic
  });

  it('ratchet splits a step into N sub-hits', () => {
    const p = createPattern('rc', 'Ratchet', 4);
    patchRow(p, 0, [0], { ratchet: 3 });
    const { clock, tr, sch, hits } = setup(p);
    tr.start();
    clock.set(0.05); sch.tick();
    clock.set(0.45); sch.tick();
    clock.set(0.6); sch.tick();
    const t0 = hits[0].at;
    expect(t0).toBeCloseTo(0.5, 6);
    expect(hits.map((h) => h.at)).toEqual([
      t0, t0 + 0.125 / 3, t0 + 0.25 / 3,
    ]);
  });

  it('flam adds ghost hits 25 ms after the step with reduced velocity', () => {
    const p = createPattern('fl', 'Flam', 4);
    patchRow(p, 0, [2], { flam: 1 }); // step index 2 → ordinal 2 → 0.25 s
    const { clock, tr, sch, hits } = setup(p);
    tr.start();
    clock.set(0.15); sch.tick();
    clock.set(0.35); sch.tick();
    clock.set(0.6); sch.tick(); // fires the 0.25 s hit
    expect(hits[0].at).toBeCloseTo(0.25, 6);
    expect(hits[1].at).toBeCloseTo(0.25 + FLAM_SEC, 6);
    expect(hits[1].velocity).toBeCloseTo(0.7, 6);
  });

  it('playhead reports the current step ordinal', () => {
    const p = createPattern('ph', 'Play', 8);
    const { clock, tr, seq } = setup(p);
    tr.start();
    clock.set(0);   // 0 beats → step 0
    expect(seq.playheadSteps()).toBe(0);
    clock.set(0.125); // 0.25 beat → 1st 16th
    expect(seq.playheadSteps()).toBe(1);
    clock.set(0.5); // 1 beat → 4th 16th
    expect(seq.playheadSteps()).toBe(4);
  });
});