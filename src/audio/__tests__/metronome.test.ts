import { describe, expect, it, vi } from 'vitest';
import { Transport } from '../transport';
import { createMockClock } from './mockClock';
import { Metronome, createClickSound, type ClickSink } from '../metronome';

describe('Metronome', () => {
  it('clicks every beat while playing, accent on beat 1 (4/4 @120)', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const clicks: { at: number; accent: boolean }[] = [];
    const sink: ClickSink = (at, accent) => clicks.push({ at, accent });
    const m = new Metronome({ transport: tr, aheadSec: 0.3, playClick: sink });
    m.setEnabled(true);

    tr.start();
    // A tick at time t schedules every beat with time <= t+0.3s.
    clock.set(0.2); m.tick(0.2);   // horizon 0.5 -> beat 1 @0.5
    clock.set(0.8); m.tick(0.8);   // horizon 1.1 -> beat 2 @1.0
    clock.set(1.2); m.tick(1.2);   // horizon 1.5 -> beat 3 @1.5
    clock.set(1.7); m.tick(1.7);   // horizon 2.0 -> beat 4 @2.0 (accent)
    clock.set(2.2); m.tick(2.2);   // horizon 2.5 -> beat 5 @2.5
    expect(clicks).toEqual([
      { at: 0.5, accent: false },  // beat 1 (second beat of bar 1)
      { at: 1.0, accent: false },  // beat 2
      { at: 1.5, accent: false },  // beat 3
      { at: 2.0, accent: true },   // beat 4 = bar start
      { at: 2.5, accent: false },  // beat 5
    ]);
  });

  it('silent when disabled or transport stopped', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sink = vi.fn();
    const m = new Metronome({ transport: tr, aheadSec: 0.4, playClick: sink });
    m.setEnabled(true);
    tr.start();
    clock.set(0.05); m.tick(0.05);  // horizon beat(0.45)=0.9 -> not yet
    expect(sink).not.toHaveBeenCalled();

    clock.set(0.15); m.tick(0.15);  // horizon beat(0.55)=1.1 -> clicks beat 1 @0.5
    expect(sink).toHaveBeenCalled();
    m.setEnabled(false);
    const before = sink.mock.calls.length;
    clock.set(0.5); m.tick(0.5);
    expect(sink.mock.calls.length).toBe(before);
    tr.stop();
  });

  it('recalc after stop/reset (re-arm at new position)', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const clicks: number[] = [];
    const m = new Metronome({ transport: tr, aheadSec: 0.3, playClick: (at) => clicks.push(at) });
    m.setEnabled(true);
    tr.start();
    clock.set(0.2); m.tick(0.2);   // beat 1 @0.5
    expect(clicks).toEqual([0.5]);
    tr.stop();                      // pause at beat 0.4
    clock.set(0.7); m.tick(0.7);   // not playing -> disarmed, no click
    expect(clicks.length).toBe(1);
    tr.start();                     // resumes at same beat
    clock.set(0.8); m.tick(0.8);   // re-arm -> next beat after 1.6 beats = beat 2
    clock.set(1.0); m.tick(1.0);   // horizon nowBeats(1.3)=2.6 -> click beat 2 @1.0
    expect(clicks).toContain(1.0);
    expect(Math.min(...clicks)).toBeGreaterThanOrEqual(0.5);
  });

  it('setGain clamps to [0,1]', () => {
    const m = new Metronome({ transport: null as unknown as Transport, playClick: () => {} });
    m.setGain(5);
    expect(m.gain).toBe(1);
    m.setGain(-2);
    expect(m.gain).toBe(0);
    m.setGain(0.7);
    expect(m.gain).toBe(0.7);
  });
});

describe('createClickSound', () => {
  it('schedules an oscillator at the exact time (fake ctx)', () => {
    const starts: number[] = [];
    const stops: number[] = [];
    const gains: { start: number; ramp: number }[] = [];
    const osc = {
      type: '', frequency: { value: 0 },
      connect: () => {},
      start: (t: number) => starts.push(t),
      stop: (t: number) => stops.push(t),
    };
    const gain = {
      gain: {
        setValueAtTime: (v: number, t: number) => gains.push({ start: t, ramp: v }),
        exponentialRampToValueAtTime: (_v: number, t: number) => { gains.push({ start: t, ramp: 0 }); },
      },
      connect: () => {},
    };
    const dest = { connect: () => {} };
    let oscCalls = 0;
    const ctx = {
      currentTime: 0,
      createOscillator: () => { oscCalls++; return osc; },
      createGain: () => gain,
    } as unknown as AudioContext;
    // destination off the graph: metronome connects gain->destination
    const sink = createClickSound(ctx);
    (ctx as unknown as { destination: unknown }).destination = dest;
    sink(1.0, true, 0.6);
    expect(oscCalls).toBe(1);
    expect(starts).toEqual([1.0]);
    expect(stops).toEqual([1.08]);
  });

  it('skips clicks already in the past', () => {
    let calls = 0;
    const ctx = { currentTime: 5, createOscillator: () => { calls++; return { frequency: { value: 0 }, connect: () => {}, start: () => {}, stop: () => {} }; } } as unknown as AudioContext;
    (ctx as unknown as { createGain: () => unknown }).createGain = () => ({ gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} });
    const sink = createClickSound(ctx);
    sink(3.0, false, 0.5); // at < currentTime
    expect(calls).toBe(0);
  });
});