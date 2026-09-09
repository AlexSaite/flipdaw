/**
 * FlipDAW — step sequencer model (M5.5 → M6.4).
 * A pattern is a 16-voice × step grid: each row is a instrument (synth drum
 * or imported sample), each column a step on the 16th-note clock. Per-step
 * velocity / flam / ratchet / probability + pattern-level swing & humanize.
 */

export const MAX_STEPS = 32;
export const MAX_ROWS = 16;

export interface StepCell {
  on: boolean;
  velocity: number;    // 0..1
  flam: number;        // 0..2 extra ghost hits (≈25 ms apart)
  ratchet: number;     // 1..4 sub-hits per step
  probability: number; // 0..1 chance the step actually fires
}

/** One instrument row: either a synth drum preset or an imported sample. */
export interface SeqRow {
  voice: string;
  kind: 'synth' | 'sample';
  /** For sample rows: the dedup key (`samples/<sha>.wav` basename). */
  sampleSha: string | null;
  steps: StepCell[];
}

export interface SeqPattern {
  id: string;
  name: string;
  /** Active step count (1..MAX_STEPS); the "loop length" in sequencer steps. */
  length: number;
  swing: number;   // 0..1 shuffle applied to odd-numbered steps
  humanize: number; // 0..1 amount of timing/velocity humanization
  rows: SeqRow[];
}

const DEFAULT_VOICES = ['kick', 'snare', 'hat', 'tom'];

export function defaultCell(): StepCell {
  return { on: false, velocity: 1, flam: 0, ratchet: 1, probability: 1 };
}

export function createRow(
  voice: string,
  kind: SeqRow['kind'] = 'synth',
  sampleSha: string | null = null,
): SeqRow {
  return {
    voice,
    kind,
    sampleSha,
    steps: Array.from({ length: MAX_STEPS }, () => defaultCell()),
  };
}

export function createPattern(
  id: string,
  name = 'Pattern',
  length = 16,
  rowCount = MAX_ROWS,
): SeqPattern {
  const rows = Array.from({ length: Math.max(1, Math.min(MAX_ROWS, Math.round(rowCount))) },
    (_, r) => createRow(DEFAULT_VOICES[r % DEFAULT_VOICES.length]));
  return {
    id,
    name,
    length: Math.min(MAX_STEPS, Math.max(1, length)),
    swing: 0,
    humanize: 0,
    rows,
  };
}

export function rowAt(p: SeqPattern, r: number): SeqRow {
  return p.rows[((r % p.rows.length) + p.rows.length) % p.rows.length];
}

export function stepAt(p: SeqPattern, r: number, i: number): StepCell {
  return rowAt(p, r).steps[normalizeCol(p, i)];
}

function normalizeCol(p: SeqPattern, i: number): number {
  const n = ((i % MAX_STEPS) + MAX_STEPS) % MAX_STEPS;
  return n < p.length ? n : n % p.length;
}

/** Toggle a step on/off. Re-activating resets velocity to 100%. */
export function toggleStep(p: SeqPattern, r: number, i: number): void {
  const c = stepAt(p, r, i);
  if (c.on) c.on = false;
  else { c.on = true; c.velocity = 1; }
}

/** Cycle velocity 100 → 75 → 50 → 25 → (off). */
export function cycleVelocity(p: SeqPattern, r: number, i: number): void {
  const c = stepAt(p, r, i);
  if (!c.on) return;
  const next = c.velocity <= 0.25 ? null : c.velocity - 0.25;
  if (next === null) { c.on = false; c.velocity = 1; }
  else c.velocity = next;
}

/** Patch one cell field; clamps ranges. */
export function patchCell(
  p: SeqPattern,
  r: number,
  i: number,
  patch: Partial<Omit<StepCell, 'on' | 'velocity'>>,
): void {
  const c = stepAt(p, r, i);
  if (patch.flam !== undefined) c.flam = Math.max(0, Math.min(2, Math.round(patch.flam)));
  if (patch.ratchet !== undefined) c.ratchet = Math.max(1, Math.min(4, Math.round(patch.ratchet)));
  if (patch.probability !== undefined) {
    c.probability = Math.max(0, Math.min(1, patch.probability));
  }
}

/** Resize the pattern (clamp steps that fall off the edge off). */
export function setLength(p: SeqPattern, len: number): void {
  p.length = Math.min(MAX_STEPS, Math.max(1, Math.round(len)));
  for (const row of p.rows) {
    for (let i = p.length; i < MAX_STEPS; i++) row.steps[i].on = false;
  }
}

export function clearPattern(p: SeqPattern): void {
  for (const row of p.rows) for (const c of row.steps) c.on = false;
}

/** Fill random steps + random velocities. Deterministic with a seeded rng. */
export function randomizePattern(p: SeqPattern, rng: () => number): void {
  clearPattern(p);
  for (let r = 0; r < p.rows.length; r++) {
    for (let i = 0; i < p.length; i++) {
      if (rng() < 0.35) {
        const c = p.rows[r].steps[i];
        c.on = true;
        c.velocity = 0.25 + Math.round(rng() * 3) * 0.25;
        c.ratchet = rng() < 0.1 ? 2 : 1;
        c.probability = rng() < 0.15 ? 0.75 : 1;
      }
    }
  }
}

export function serializePattern(p: SeqPattern) {
  return {
    id: p.id,
    name: p.name,
    length: p.length,
    swing: p.swing,
    humanize: p.humanize,
    rows: p.rows.map((row) => ({
      voice: row.voice,
      kind: row.kind,
      sampleSha: row.sampleSha,
      steps: row.steps.slice(0, p.length).map((c) => ({ ...c })),
    })),
  };
}