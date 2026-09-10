import { describe, it, expect } from 'vitest';
import {
  clamp01, dbToPct, GREEN_DB, HOLD_FALL_DB_PER_MS, integrateLoudness,
  loudnessLu, luToPct, METER_FLOOR_DB, meterZone, RED_DB, stepValue,
  toDb, zoneColor,
} from '../metering';

describe('toDb', () => {
  it('maps full scale to 0 dBFS', () => {
    expect(toDb(1)).toBeCloseTo(0, 6);
  });
  it('maps half scale to ~-6 dBFS', () => {
    expect(toDb(0.5)).toBeCloseTo(-6.0206, 3);
  });
  it('never returns -Infinity for silence', () => {
    expect(toDb(0)).toBeCloseTo(-120, 6);
  });
});

describe('meterZone (ГОСТ Р МЭК 60268-18 zones)', () => {
  it('green below -6 dBFS', () => {
    expect(meterZone(GREEN_DB - 1)).toBe('green');
  });
  it('yellow between -6 and red', () => {
    expect(meterZone(-3)).toBe('yellow');
    expect(meterZone(GREEN_DB + 0.01)).toBe('yellow');
  });
  it('red at/above the limiter threshold (-1 dBFS)', () => {
    expect(meterZone(RED_DB)).toBe('red');
    expect(meterZone(0)).toBe('red');
  });
  it('zone colors: green/yellow/red', () => {
    expect(zoneColor('green')).toBe('#14b8a6');
    expect(zoneColor('yellow')).toBe('#f59e0b');
    expect(zoneColor('red')).toBe('#ef4444');
  });
});

describe('dbToPct', () => {
  it('maps the floor to 0 and 0 dBFS to 100%', () => {
    expect(dbToPct(METER_FLOOR_DB)).toBe(0);
    expect(dbToPct(0)).toBe(1);
  });
  it('is linear in dB and monotonic', () => {
    expect(dbToPct(-25)).toBeCloseTo(0.5, 6);
    expect(dbToPct(-10)).toBeGreaterThan(dbToPct(-20));
  });
  it('clamps out-of-range', () => {
    expect(dbToPct(-120)).toBe(0);
    expect(dbToPct(6)).toBe(1);
  });
});

describe('stepValue (discrete precise controls)', () => {
  it('rounds to the requested step', () => {
    expect(stepValue(0.333, 0.01)).toBe(0.33);
    expect(stepValue(0.333, 0.05)).toBe(0.35);
  });
  it('returns the value unchanged when step is invalid', () => {
    expect(stepValue(0.42, 0)).toBe(0.42);
    expect(stepValue(0.42, -1)).toBe(0.42);
  });
});

describe('loudness proxy (EBU R128-style, ~-18 LUFS reference)', () => {
  it('integrates power with a one-pole window', () => {
    expect(integrateLoudness(1, 0)).toBeCloseTo(0.9, 6);
    expect(integrateLoudness(0.5, 0)).toBeCloseTo(0.225, 6);
  });
  it('reads a typical programme near the reference', () => {
    // -21 dBFS RMS ≈ -18 LUFS (reference calibration).
    const rms = 10 ** (-21 / 20);
    const lu = loudnessLu(integrateLoudness(rms, 0));
    expect(lu).toBeGreaterThan(-19);
    expect(lu).toBeLessThan(-17.5);
  });
  it('luToPct places the reference at 55% of the bar', () => {
    expect(luToPct(-18)).toBeCloseTo(0.55, 6);
    expect(luToPct(-40)).toBe(0);
    expect(luToPct(0)).toBe(1);
    expect(luToPct(-80)).toBe(0);
  });
});

describe('hold ballistic (IEC 60268-10: 20 dB over 2.8 s)', () => {
  it('decays at the documented rate', () => {
    expect(HOLD_FALL_DB_PER_MS).toBeCloseTo(20 / 2800, 10);
  });
});

describe('clamp01', () => {
  it('clamps values into [0,1]', () => {
    expect(clamp01(1.2)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
  });
});