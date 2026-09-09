import { describe, expect, it } from 'vitest';
import {
  PPQ, BASE_NOTE,
  encodeNoteOn, encodeNoteOff, encodeCc, encodeRealtime,
  decodeMidiMessage, noteForCell, cellFromNote, ccForTrack, trackFromCc,
  clockTickTimes, MidiClockOut, ClockInput,
} from '../midi';

describe('midi (message codec)', () => {
  it('round-trips note on/off and cc', () => {
    expect(decodeMidiMessage(encodeNoteOn(60, 100))).toEqual({ kind: 'noteOn', note: 60, velocity: 100 });
    expect(decodeMidiMessage(encodeNoteOff(60))).toEqual({ kind: 'noteOff', note: 60 });
    expect(decodeMidiMessage(encodeCc(7, 64))).toEqual({ kind: 'cc', cc: 7, value: 64 });
  });

  it('treats note-on velocity 0 as note-off', () => {
    const bytes = new Uint8Array([0x90, 60, 0]);
    expect(decodeMidiMessage(bytes)?.kind).toBe('noteOff');
  });

  it('honours the channel mask', () => {
    const bytes = encodeCc(1, 64, 3);
    expect(decodeMidiMessage(bytes, 3)).toEqual({ kind: 'cc', cc: 1, value: 64 });
    expect(decodeMidiMessage(bytes, 0)).toBeNull();
  });

  it('clamps note/cc/value ranges', () => {
    expect(decodeMidiMessage(encodeNoteOn(200, 300))).toEqual({ kind: 'noteOn', note: 127, velocity: 127 });
    expect(decodeMidiMessage(encodeCc(999, -5))).toEqual({ kind: 'cc', cc: 127, value: 0 });
  });

  it('decodes realtime bytes', () => {
    expect(decodeMidiMessage(encodeRealtime('clock'))).toEqual({ kind: 'clock' });
    expect(decodeMidiMessage(encodeRealtime('start'))).toEqual({ kind: 'start' });
    expect(decodeMidiMessage(encodeRealtime('stop'))).toEqual({ kind: 'stop' });
  });
});

describe('midi (grid + fader mapping)', () => {
  it('maps cells to launchpad-style notes and back', () => {
    expect(noteForCell(0, 0)).toBe(BASE_NOTE);
    expect(noteForCell(1, 0)).toBe(BASE_NOTE + 8);
    expect(noteForCell(0, 1)).toBe(BASE_NOTE + 1);
    expect(cellFromNote(BASE_NOTE + 9)).toEqual({ trackIdx: 1, scene: 1 });
  });

  it('stays in the 8x8 grid', () => {
    expect(noteForCell(8, 0)).toBeNull();
    expect(noteForCell(0, 8)).toBeNull();
    expect(cellFromNote(BASE_NOTE + 64)).toBeNull();
  });

  it('maps track faders to cc', () => {
    expect(ccForTrack(0)).toBe(0);
    expect(ccForTrack(3)).toBe(3);
    expect(ccForTrack(8)).toBeNull();
    expect(trackFromCc(3)).toBe(3);
    expect(trackFromCc(99)).toBeNull();
  });
});

describe('midi (clock)', () => {
  it('spaces 24 ticks inside one beat', () => {
    const ticks = clockTickTimes(120, 10); // 0.5 s/beat
    expect(ticks).toHaveLength(24);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(0.5 / 24, 12);
    }
    expect(ticks[0]).toBe(10);
  });

  it('MidiClockOut chains ticks exactly on transport time (no accumulation drift)', () => {
    const clock = { now: () => tNow, bpm: () => 120 };
    let tNow = 0;
    const promised: number[] = [];
    const queue: Array<{ t: number; fn: () => void }> = [];
    const out = new MidiClockOut(
      { at(sec, fn) { promised.push(sec); queue.push({ t: sec, fn }); } },
      clock,
      () => {},
    );
    out.start();

    const perTick = 60 / 120 / PPQ;
    const TICKS = 1000; // ~1.7 s of clock
    for (let i = 1; i <= TICKS + 1; i++) {
      tNow = i * perTick;
      for (;;) {
        const idx = queue.findIndex((s) => s.t <= tNow);
        if (idx < 0) break;
        queue.splice(idx, 1)[0].fn();
      }
    }
    out.stop();

    expect(promised.length).toBeGreaterThanOrEqual(TICKS + 1);
    promised.forEach((t, k) => expect(t).toBeCloseTo(k * perTick, 12));
    expect(out.running).toBe(false);
  });

  it('ClockInput estimates bpm from tick stream', () => {
    const ci = new ClockInput();
    const perTick = 60 / 120 / PPQ; // 120 bpm
    let t = 0;
    for (let k = 0; k < 48; k++) { ci.tick(t); t += perTick; }
    expect(ci.bpm()).toBeCloseTo(120, 6);
  });

  it('ClockInput ignores a clock restart gap', () => {
    const ci = new ClockInput();
    const perTick = 60 / 120 / PPQ;
    let t = 0;
    for (let k = 0; k < 24; k++) { ci.tick(t); t += perTick; }
    ci.tick(t + 5); // long gap — excluded from estimate
    for (let k = 0; k < 24; k++) { ci.tick(t); t += perTick; }
    expect(ci.bpm()).toBeCloseTo(120, 6);
  });
});