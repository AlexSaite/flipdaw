import { describe, expect, it } from 'vitest';
import {
  createDeckMixer, crossfadeGains, eqAmplitude, EQ_RANGE_DB,
} from '../deckMixer';

function makeCtx() {
  const mkParam = () => ({
    value: 0,
    setValueAtTime(v: number) { this.value = v; },
    setTargetAtTime(v: number) { this.value = v; },
    cancelScheduledValues() {},
  });
  const ctx = {
    currentTime: 0,
    createGain() {
      const n = { gain: mkParam(), connect() {}, disconnect() {} };
      return n as unknown as GainNode;
    },
    createBiquadFilter() {
      return {
        type: '',
        frequency: { value: 0 },
        Q: { value: 1 },
        gain: mkParam(),
        connect() {},
        disconnect() {},
      } as unknown as BiquadFilterNode;
    },
  } as unknown as AudioContext;
  return ctx;
}

const dest = { connect() {} } as unknown as AudioNode;

describe('crossfadeGains', () => {
  it('endpoints are only-A / only-B', () => {
    const [a0, b0] = crossfadeGains(0);
    expect(a0).toBeCloseTo(1, 9);
    expect(b0).toBeCloseTo(0, 9);
    const [a1, b1] = crossfadeGains(1);
    expect(a1).toBeCloseTo(0, 9);
    expect(b1).toBeCloseTo(1, 9);
  });

  it('center is constant-power (−3 dB each)', () => {
    const [a, b] = crossfadeGains(0.5);
    expect(a).toBeCloseTo(Math.SQRT1_2, 9);
    expect(b).toBeCloseTo(Math.SQRT1_2, 9);
    expect(a * a + b * b).toBeCloseTo(1, 9);
  });

  it('clamps outside 0..1', () => {
    expect(crossfadeGains(-1)[0]).toBeCloseTo(1, 9);
    expect(crossfadeGains(2)[1]).toBeCloseTo(1, 9);
  });
});

describe('createDeckMixer', () => {
  it('routes the crossfader through both deck buses', () => {
    const m = createDeckMixer(makeCtx(), dest);
    m.crossfade(0);
    expect(m.deckA.crossGain()).toBeCloseTo(1, 6);
    expect(m.deckB.crossGain()).toBeCloseTo(0, 6);
    m.crossfade(1);
    expect(m.deckA.crossGain()).toBeCloseTo(0, 6);
    expect(m.deckB.crossGain()).toBeCloseTo(1, 6);
    m.crossfade(0.5);
    expect(m.deckA.crossGain()).toBeCloseTo(Math.SQRT1_2, 6);
    expect(m.deckB.crossGain()).toBeCloseTo(Math.SQRT1_2, 6);
    expect(m.getCross()).toBe(0.5);
    m.crossfade(5);
    expect(m.getCross()).toBe(1);
  });

  it('clamps EQ to ±12 dB and applies linear amplitude', () => {
    expect(eqAmplitude(18)).toBeCloseTo(10 ** (EQ_RANGE_DB / 20), 6);
    expect(eqAmplitude(-18)).toBeCloseTo(10 ** (-EQ_RANGE_DB / 20), 6);
    const m = createDeckMixer(makeCtx(), dest);
    m.deckA.setEq('low', 18);
    expect(m.deckA.bandGain('low')).toBeCloseTo(eqAmplitude(EQ_RANGE_DB), 6);
    m.deckB.setEq('high', -30);
    expect(m.deckB.bandGain('high')).toBeCloseTo(eqAmplitude(-EQ_RANGE_DB), 6);
    m.deckB.setEq('mid', 6);
    expect(m.deckB.bandGain('mid')).toBeCloseTo(eqAmplitude(6), 6);
  });
});