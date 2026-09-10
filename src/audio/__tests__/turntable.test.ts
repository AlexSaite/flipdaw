import { describe, expect, it } from 'vitest';
import { TurntablePlayer, TT_FADE, TT_MAX_RATE, TT_MIN_RATE } from '../turntable';
import { createMockClock } from './mockClock';

interface Rig {
  clock: ReturnType<typeof createMockClock>;
  stops: number[];
  srcOffsets: number[];
  gains: GainNode[];
  readonly src: AudioBufferSourceNode | null;
  p: TurntablePlayer;
  buf: AudioBuffer;
}

const mkParam = (v = 0) => ({
  value: v,
  setTargetAtTime(next: number) { this.value = next; },
});

function makeRig(duration = 2): Rig {
  const clock = createMockClock(0);
  const stops: number[] = [];
  const srcOffsets: number[] = [];
  const gains: GainNode[] = [];
  let lastSrc: AudioBufferSourceNode | null = null;
  const ctx = {
    get currentTime() { return clock.currentTime; },
    createGain() {
      const n = { gain: mkParam(0.9), connect() {}, disconnect() {} };
      gains.push(n as unknown as GainNode);
      return n as unknown as GainNode;
    },
    createBufferSource() {
      lastSrc = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        start(_t: number, off?: number) { srcOffsets.push(off ?? 0); },
        stop(t: number) { stops.push(t); },
        connect() {},
        disconnect() {},
      } as unknown as AudioBufferSourceNode;
      return lastSrc;
    },
  } as unknown as AudioContext;
  const input = { connect() {} } as unknown as AudioNode;
  const p = new TurntablePlayer({ ctx, input });
  const buf = { duration } as AudioBuffer;
  return { clock, stops, srcOffsets, gains, get src() { return lastSrc; }, p, buf };
}

describe('TurntablePlayer', () => {
  it('load mounts a record in stopped state', () => {
    const { p, buf } = makeRig();
    expect(p.state).toBe('empty');
    p.load(buf);
    expect(p.state).toBe('stopped');
    expect(p.attached).toBe(true);
    expect(p.duration).toBe(2);
    expect(p.progress(0)).toBe(0);
  });

  it('spins: offset advances with (now − startAt)·rate and wraps the record', () => {
    const { p, buf, clock } = makeRig(2);
    p.load(buf);
    p.play();
    expect(p.state).toBe('spinning');
    clock.advance(1.375);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(1.375, 9);
    clock.advance(1);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(0.375, 9);
  });

  it('rate change preserves offset continuity', () => {
    const { p, buf, clock } = makeRig(8);
    p.load(buf);
    p.play();
    clock.advance(1);
    p.setRate(1.5);
    expect(p.rate).toBe(1.5);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(1, 9);
    clock.advance(1);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(2.5, 9);
  });

  it('rate clamps to 50–160% and applies playbackRate to the live source', () => {
    const rig = makeRig();
    rig.p.load(rig.buf);
    rig.p.setRate(9);
    expect(rig.p.rate).toBe(TT_MAX_RATE);
    rig.p.setRate(0.1);
    expect(rig.p.rate).toBe(TT_MIN_RATE);
    rig.p.setRate(1.25);
    expect(rig.p.rate).toBe(1.25);
    rig.p.play();
    expect(rig.src?.playbackRate.value).toBeCloseTo(1.25, 9);
  });

  it('seek is sample-accurate and works while spinning', () => {
    const { p, buf, clock } = makeRig();
    p.load(buf);
    p.play();
    clock.advance(0.5);
    p.seek(1.9375);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(1.9375, 9);
    clock.advance(0.25);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(0.1875, 9);
  });

  it('seek clamps into the record range', () => {
    const { p, buf, srcOffsets } = makeRig();
    p.load(buf);
    p.seek(-5);
    p.seek(99);
    p.play();
    expect(p.offsetAt(0)).toBe(0);
    expect(srcOffsets[0]).toBe(2);
  });

  it('stop freezes the needle and stop→play resumes from that offset', () => {
    const { p, buf, clock } = makeRig();
    p.load(buf);
    p.play();
    clock.advance(0.5);
    p.stop();
    expect(p.state).toBe('stopped');
    clock.advance(2);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(0.5, 9);
    p.play();
    expect(p.state).toBe('spinning');
    clock.advance(0.25);
    expect(p.offsetAt(clock.currentTime)).toBeCloseTo(0.75, 9);
  });

  it('progress reports 0..1 across the record', () => {
    const { p, buf, clock } = makeRig(2);
    p.load(buf);
    p.seek(1.5);
    expect(p.progress(0)).toBeCloseTo(0.75, 9);
    p.play();
    clock.advance(0.25);
    expect(p.progress(clock.currentTime)).toBeCloseTo(0.875, 9);
  });

  it('setGain updates the live gain node', () => {
    const { p, buf, gains } = makeRig();
    p.setGain(0.4);
    expect(p.gain).toBe(0.4);
    p.load(buf);
    p.play();
    expect(gains[0].gain.value).toBe(0.4);
    p.setGain(0.7);
    expect(gains[0].gain.value).toBe(0.7);
  });

  it('stop schedules a fade and stop with onended cleanup', () => {
    const { p, buf, clock, stops } = makeRig();
    p.load(buf);
    p.play();
    clock.advance(0.25);
    p.stop();
    expect(stops.length).toBe(1);
    expect(stops[0]).toBeCloseTo(clock.currentTime + TT_FADE * 2, 9);
    expect(p.playing).toBe(false);
  });

  it('load tears down any running source before remounting', () => {
    const { p, buf, clock, stops, srcOffsets } = makeRig();
    p.load(buf);
    p.play();
    clock.advance(0.5);
    p.load(buf);
    expect(stops.length).toBe(1);
    expect(srcOffsets.length).toBe(1);
    expect(p.state).toBe('stopped');
  });
});