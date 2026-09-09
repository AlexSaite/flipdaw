import { describe, expect, it } from 'vitest';
import { TapTempo, median } from '../tapTempo';

describe('median', () => {
  it('odd length', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('even length averages middle two', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('TapTempo', () => {
  it('returns null until 2 taps', () => {
    const tt = new TapTempo();
    expect(tt.tap(0)).toBeNull();
    expect(tt.tap(0.5)).toBe(120);
  });

  it('computes bpm from steady intervals', () => {
    const tt = new TapTempo();
    tt.tap(0); tt.tap(0.5); tt.tap(1.0); tt.tap(1.5);
    expect(tt.tap(2.0)).toBe(120);
  });

  it('uses the median, ignoring an outlier', () => {
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(0.5);   // 0.5
    tt.tap(1.6);   // 1.1 outlier
    tt.tap(2.1);   // 0.5
    tt.tap(2.6);   // 0.5
    // intervals [0.5, 1.1, 0.5, 0.5] -> median 0.5 -> 120
    expect(tt.tap(3.1)).toBe(120);
  });

  it('resets after a >2s pause', () => {
    const tt = new TapTempo();
    tt.tap(0); tt.tap(0.5);            // 120
    const afterReset = tt.tap(3.0);     // gap 2.5 > 2 -> buffer cleared
    expect(afterReset).toBeNull();      // needs 2 fresh taps
    expect(tt.tap(3.5)).toBe(120);
  });

  it('clamps to the allowed BPM range', () => {
    const tt = new TapTempo();
    tt.tap(0);
    expect(tt.tap(0.1)).toBe(240);      // 600 bpm -> clamp 240
    tt.reset();
    tt.tap(10);
    expect(tt.tap(11.75)).toBe(40);     // ~34 bpm -> clamp 40
  });

  it('reset() clears the buffer', () => {
    const tt = new TapTempo();
    tt.tap(0); tt.tap(0.5);
    tt.reset();
    expect(tt.tap(1.0)).toBeNull();
  });
});