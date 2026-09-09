/**
 * FlipDAW — step sequencer model (M5.5).
 * Per-step velocity / flam / ratchet / probability + pattern-level
 * swing & humanize (features distilled from drumhaus / Drum Loop Studio).
 * A pattern is a row of StepCells fired from a 16th-note clock.
 */

export const MAX_STEPS = 32;

export interface StepCell {
  on: boolean;
  velocity: number;    // 0..1
  flam: number;        // 0..2 extra ghost hits (≈25 ms apart)
  ratchet: number;     // 1..4 sub-hits per step
  probability: number; // 0..1 chance the step actually fires
}

export interface SeqPattern {
  id: string;
  name: string;
  /** Active step count (1..MAX_STEPS); the "loop length" in sequencer steps. */
  length: number;
  steps: StepCell[];
  /** 0..1 shuffle applied to odd-numbered steps. */
  swing: number;
  /** 0..1 amount of timing/velocity humanization (seeded per pattern). */
  humanize: number;
}

export function defaultCell(): StepCell {
  return { on: false, velocity: 1, flam: 0, ratchet: 1, probability: 1 };
}

export function createPattern(id: string, name = 'Pattern', length = 16): SeqPattern {
  const steps = Array.from({ length: MAX_STEPS }, () => defaultCell());
  return { id, name, length: Math.min(MAX_STEPS, Math.max(1, length)), steps, swing: 0, humanize: 0 };
}

export function stepAt(p: SeqPattern, i: number): StepCell {
  return p.steps[normalizeIndex(p, i)];
}

function normalizeIndex(p: SeqPattern, i: number): number {
  const n = ((i % p.steps.length) + p.steps.length) % p.steps.length;
  return n < p.length ? n : n % p.length;
}

/** Toggle a step on/off. Re-activating resets velocity to 100%. */
export function toggleStep(p: SeqPattern, i: number): void {
  const c = stepAt(p, i);
  if (c.on) c.on = false;
  else { c.on = true; c.velocity = 1; }
}

/** Cycle velocity 100 → 75 → 50 → 25 → (off). */
export function cycleVelocity(p: SeqPattern, i: number): void {
  const c = stepAt(p, i);
  if (!c.on) return;
  const next = c.velocity <= 0.25 ? null : c.velocity - 0.25;
  if (next === null) { c.on = false; c.velocity = 1; }
  else c.velocity = next;
}

/** Patch one cell field; clamps ranges. */
export function patchCell(
  p: SeqPattern,
  i: number,
  patch: Partial<Omit<StepCell, 'on' | 'velocity'>>,
): void {
  const c = stepAt(p, i);
  if (patch.flam !== undefined) c.flam = Math.max(0, Math.min(2, Math.round(patch.flam)));
  if (patch.ratchet !== undefined) c.ratchet = Math.max(1, Math.min(4, Math.round(patch.ratchet)));
  if (patch.probability !== undefined) {
    c.probability = Math.max(0, Math.min(1, patch.probability));
  }
}

/** Resize the pattern (clamp steps that fall off the edge off). */
export function setLength(p: SeqPattern, len: number): void {
  p.length = Math.min(MAX_STEPS, Math.max(1, Math.round(len)));
  for (let i = p.length; i < MAX_STEPS; i++) { p.steps[i].on = false; }
}

export function clearPattern(p: SeqPattern): void {
  for (const c of p.steps) c.on = false;
}

/** Fill random steps + random velocities. Deterministic with a seeded rng. */
export function randomizePattern(p: SeqPattern, rng: () => number): void {
  clearPattern(p);
  for (let i = 0; i < p.length; i++) {
    if (rng() < 0.35) {
      p.steps[i].on = true;
      p.steps[i].velocity = 0.25 + Math.round(rng() * 3) * 0.25;
      p.steps[i].ratchet = rng() < 0.1 ? 2 : 1;
      p.steps[i].probability = rng() < 0.15 ? 0.75 : 1;
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
    steps: p.steps.slice(0, p.length).map((c) => ({ ...c })),
  };
}