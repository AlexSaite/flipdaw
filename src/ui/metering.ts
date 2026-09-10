/**
 * Metering helpers (UI-REDESIGN §7). Peak meters follow the three-colour
 * zone convention of ГОСТ Р МЭК 60268-18 / IEC 60268-10: green working zone,
 * amber near the limit, red overload; the master loudness mode is a
 * lightweight EBU R128-style bar calibrated to a −18 LUFS reference
 * (accurate BS.1770 metering is deferred — see UI-REDESIGN §7/§8).
 */

export type MeterZone = 'green' | 'yellow' | 'red';

/** Green→amber handover, dBFS (level meter). */
export const GREEN_DB = -6;
/** Amber→red handover, dBFS — limiter region (−1 dBFS brickwall). */
export const RED_DB = -1;
/** Floor of the meter's dB scale, dBFS. */
export const METER_FLOOR_DB = -50;
/** PPM hold: fall 20 dB in 2.8 s (IEC 60268-10 ballistic). */
export const HOLD_FALL_DB_PER_MS = 20 / 2800;
/** Loudness bar reference calibration (EBU R128 target ≈ −18 LUFS). */
export const LOUDNESS_REF_DB = -18;
/** RMS level (dBFS) that should read LOUDNESS_REF_DB on the loudness bar. */
export const LOUDNESS_RMS_REF_DB = -21;
/** Range of the loudness bar, LU. */
export const LOUDNESS_FLOOR_LU = -40;
export const LOUDNESS_CEIL_LU = 0;

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Amplitude 0..1 → dBFS. */
export function toDb(p: number): number {
  return 20 * Math.log10(Math.max(1e-6, p));
}

/** Three-colour zone by peak level (dBFS). */
export function meterZone(db: number): MeterZone {
  if (db >= RED_DB) return 'red';
  if (db > GREEN_DB) return 'yellow';
  return 'green';
}

export function zoneColor(z: MeterZone): string {
  if (z === 'red') return '#ef4444';
  if (z === 'yellow') return '#f59e0b';
  return '#14b8a6';
}

/** dBFS in [floor, 0] → fill fraction 0..1 (linear in dB). */
export function dbToPct(db: number, floorDb = METER_FLOOR_DB): number {
  return clamp01((db - floorDb) / (0 - floorDb));
}

/** LUFS-ish value [floor, 0] → fill fraction 0..1. */
export function luToPct(lu: number): number {
  return clamp01((lu - LOUDNESS_FLOOR_LU) / (LOUDNESS_CEIL_LU - LOUDNESS_FLOOR_LU));
}

/** Round a 0..1 value of a precise control to a discrete step. */
export function stepValue(v: number, step: number): number {
  if (!(step > 0)) return v;
  return Number((Math.round(v / step) * step).toFixed(6));
}

/**
 * Lightweight loudness proxy: exponential power integrator (≈30 Hz
 * momentary window) shifted by LOUDNESS_REF_DB so a typical programme
 * (≈ −21 dBFS RMS) reads ≈ −18 LUFS. `sample` is a 0..1 amplitude.
 */
export function integrateLoudness(sample: number, state: number): number {
  const target = Math.min(1, Math.max(0, sample)) ** 2;
  // ~0.9 smoothing factor per frame — momentary (≈300 ms) window.
  return state + (target - state) * 0.9;
}

/** Meters accumulated power state → LUFS-shifted reading (LU). */
export function loudnessLu(state: number): number {
  const rmsDb = 20 * Math.log10(Math.max(1e-6, Math.sqrt(state)));
  return rmsDb + (LOUDNESS_REF_DB - LOUDNESS_RMS_REF_DB);
}