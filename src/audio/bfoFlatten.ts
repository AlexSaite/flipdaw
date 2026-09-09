/**
 * FlipDAW — B&O Flatten preset (M5).
 * ADR-011: this is a PLACEHOLDER built from the community-measured response
 * of the 2017 Spectre x360 (Kaby Lake) laptop speakers. It must be replaced
 * with our own REW sweep once the validation rig is in place.
 */

import { fitEq, type EqBand } from './calibration';

export interface FlattenPreset {
  name: string;
  bands: EqBand[];
  /** Source of the curve (which measurement family). */
  provenance: string;
}

/**
 * Placeholder octave-band correction for the Spectre x360 internal speakers.
 * Community measurements show a rising ~+8 dB shelf from ~400 Hz up and a
 * +2..3 dB bump around 8 kHz — this preset gently flattens that, so it is
 * safe to leave on during normal sessions.
 */
export function bfoPreset(): FlattenPreset {
  const bands: EqBand[] = [
    { freq: 125, gainDb: -1.0, q: 1.0 },
    { freq: 250, gainDb: -1.5, q: 1.0 },
    { freq: 500, gainDb: -2.5, q: 1.0 },
    { freq: 1000, gainDb: -3.0, q: 1.0 },
    { freq: 2000, gainDb: -3.0, q: 1.0 },
    { freq: 4000, gainDb: -2.0, q: 1.0 },
    { freq: 8000, gainDb: -1.5, q: 1.0 },
  ];
  return { name: 'B&O Flatten (placeholder)', bands, provenance: 'community/spektral-plot' };
}

/**
 * Combine an own REW sweep with the placeholder: compute the flattening EQ
 * for the measured response, then blend towards the preset where the sweep
 * has no coverage.
 */
export function bfoFlatten(magsDb: number[], freqs: number[]): FlattenPreset {
  const measured = fitEq(magsDb, freqs);
  const preset = bfoPreset().bands;
  const byFreq = new Map(preset.map((b) => [b.freq, b.gainDb]));
  for (const b of measured) byFreq.set(b.freq, b.gainDb);
  const merged: EqBand[] = preset.map((b) => {
    const g = byFreq.get(b.freq);
    return g === undefined ? b : { freq: b.freq, gainDb: g, q: b.q };
  });
  return { name: 'B&O Flatten (measured)', bands: merged, provenance: 'rew-sweep' };
}