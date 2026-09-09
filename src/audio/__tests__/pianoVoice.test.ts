import { describe, expect, it } from 'vitest';
import { createPianoVoice, midiToFreq } from '../pianoVoice';

interface FakeParam {
  value: number;
  calls: { op: 'set' | 'ramp'; value: number; when: number }[];
  setValueAtTime(v: number, when: number): void;
  exponentialRampToValueAtTime(v: number, when: number): void;
  cancelScheduledValues(when: number): void;
}

interface FakeGain {
  gain: FakeParam;
  connect(dest: unknown): unknown;
}

interface FakeOsc {
  type: string;
  frequency: { value: number };
  detune: { value: number };
  start(t: number): void;
  stop(t: number): void;
  connect(dest: FakeGain): FakeGain;
}

function makeParam(): FakeParam {
  const param = {
    value: 0,
    calls: [] as { op: 'set' | 'ramp'; value: number; when: number }[],
  };
  return {
    get value() { return param.value; },
    set value(v: number) { param.value = v; },
    get calls() { return param.calls; },
    setValueAtTime(v: number, when: number) { param.calls.push({ op: 'set', value: v, when }); },
    exponentialRampToValueAtTime(v: number, when: number) { param.calls.push({ op: 'ramp', value: v, when }); },
    cancelScheduledValues() {},
  };
}

function makeGain(): FakeGain {
  return { gain: makeParam(), connect: (dest: unknown) => dest };
}

function makeFakeCtx() {
  const starts: number[] = [];
  const stops: number[] = [];
  let oscCount = 0;

  const ctx = {
    currentTime: 0,
    createOscillator(): FakeOsc {
      oscCount++;
      return {
        type: 'sine',
        frequency: { value: 0 },
        detune: { value: 0 },
        start(t: number) { starts.push(t); },
        stop(t: number) { stops.push(t); },
        connect: (dest: FakeGain) => dest,
      };
    },
    createGain(): FakeGain {
      return makeGain();
    },
  } as unknown as AudioContext;

  return { ctx, starts, stops, getOscCount: () => oscCount };
}

const noopDest = {} as unknown as AudioNode;

const RELEASE_SEC = 0.16;
const DECAY_SEC = 2.6;

/** Count stops within an epsilon — avoids float (0.16+0.01 vs 0.17) flakiness. */
const countNear = (arr: number[], t: number, eps = 1e-6): number =>
  arr.filter((x) => Math.abs(x - t) < eps).length;

describe('pianoVoice', () => {
  it('strikes a note as 5 oscillators at the exact `when`', () => {
    const { ctx, starts, getOscCount } = makeFakeCtx();
    const voice = createPianoVoice(ctx, noopDest);
    voice.noteOn(60, 0.8, 1.0);
    expect(getOscCount()).toBe(5);
    expect(starts).toEqual([1, 1, 1, 1, 1]);
  });

  it('scales level with velocity and schedules natural decay', () => {
    const { ctx } = makeFakeCtx();
    const gains: FakeParam[] = [];
    (ctx as unknown as { createGain: () => FakeGain }).createGain = () => {
      const node = makeGain();
      gains.push(node.gain);
      return node;
    };
    const voice = createPianoVoice(ctx, noopDest);
    voice.noteOn(60, 0.8, 1.0);
    // gains[0] = note bus, gains[1..5] = partial buses
    const set = gains[0].calls.filter((c) => c.op === 'set');
    expect(set[0].value).toBeCloseTo(0.16 + 0.5 * 0.8, 6); // level = 0.56
    expect(set[0].when).toBe(1.0);
    expect(gains[0].calls.some((c) => c.op === 'ramp' && c.value === 0.0001 && c.when === 1.0 + 2.6)).toBe(true);
    expect(gains).toHaveLength(6);
  });

  it('noteOff releases early with a short fade', () => {
    const { ctx, stops } = makeFakeCtx();
    const voice = createPianoVoice(ctx, noopDest);
    voice.noteOn(60, 0.5, 1.0);
    voice.noteOff(60, 2.0);
    expect(countNear(stops, 2.0 + RELEASE_SEC + 0.01)).toBe(5); // early release
  });

  it('retrigger cuts the previous voice', () => {
    const { ctx, stops } = makeFakeCtx();
    const voice = createPianoVoice(ctx, noopDest);
    voice.noteOn(60, 0.5, 1.0);
    voice.noteOn(60, 1.0, 1.5); // hammer hits again
    expect(countNear(stops, 1.5 + RELEASE_SEC + 0.01)).toBe(5); // old voice cut
    expect(countNear(stops, 1.5 + DECAY_SEC + 0.05)).toBe(5); // new natural end
  });

  it('allOff releases every sounding note', () => {
    const { ctx, stops } = makeFakeCtx();
    const voice = createPianoVoice(ctx, noopDest);
    voice.noteOn(60, 0.5, 1.0);
    voice.noteOn(64, 0.5, 1.0);
    voice.allOff(5.0);
    expect(countNear(stops, 5.0 + RELEASE_SEC + 0.01)).toBe(10); // 5 partials × 2 voices
  });

  it('midiToFreq maps A4=440, A5=880', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 8);
    expect(midiToFreq(81)).toBeCloseTo(880, 8);
  });
});