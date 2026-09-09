import { describe, expect, it, vi } from 'vitest';
import { Transport } from '../transport';
import { Scheduler } from '../scheduler';
import { ClipPlayer } from '../clipPlayer';
import type { TrackStrip } from '../graph';
import { createMockClock } from './mockClock';

function makeSource() {
  const source = {
    buffer: null as AudioBuffer | null,
    loop: false,
    playbackRate: { value: 1, setValueAtTime: (v: number) => { source.playbackRate.value = v; } },
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onended: null as (() => void) | null,
  };
  return source;
}

function makeCtx(source: ReturnType<typeof makeSource>) {
  return {
    currentTime: 0,
    createBufferSource: () => source,
    createGain: () => ({
      gain: { value: 0.9, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
  } as unknown as AudioContext;
}

const strip = { input: {} } as unknown as TrackStrip;

describe('ClipPlayer tempo-follow (beat lock)', () => {
  it('playbackRate follows bpm when the clip has a beat lock', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const source = makeSource();
    const p = new ClipPlayer({ ctx: makeCtx(source), transport: tr, scheduler: sch, strip });

    p.setBeatLock(4);                 // bar-length clip
    p.attach({ duration: 2 } as AudioBuffer); // natural bpm 120
    tr.start();
    p.toggle('off');
    clock.advance(0.05); sch.tick();  // source.start(0)
    expect(p.state).toBe('playing');
    expect(source.playbackRate.value).toBe(1);

    tr.setBpm(240);                   // transport emits → re-tune live
    expect(source.playbackRate.value).toBe(2);
  });

  it('unlocked clips keep fixed tempo (rate 1) on bpm change', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const source = makeSource();
    const p = new ClipPlayer({ ctx: makeCtx(source), transport: tr, scheduler: sch, strip });

    p.attach({ duration: 2 } as AudioBuffer);
    tr.start();
    p.toggle('off');
    clock.advance(0.05); sch.tick();
    tr.setBpm(200);
    expect(source.playbackRate.value).toBe(1);
  });

  it('quantized toggle: stop is scheduled on boundary, progress reflects loop phase', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const source = makeSource();
    const p = new ClipPlayer({ ctx: makeCtx(source), transport: tr, scheduler: sch, strip });

    p.attach({ duration: 4 } as AudioBuffer);
    tr.start();
    clock.set(0.5);
    const res = p.toggle('1bar');     // next bar boundary beat 4 → t=2.0
    expect(res.action).toBe('start');
    expect(res.atSec).toBeCloseTo(2.0, 9);
    clock.set(2.0); sch.tick();
    expect(p.state).toBe('playing');
    expect(p.progress(3.0)).toBeCloseTo(0.25, 9); // 1s into a 4s loop

    const stop = p.toggle('1/2');
    expect(stop.action).toBe('stop');
    expect(stop.atSec).toBeCloseTo(2.0, 9);       // exactly on boundary → stop now
    clock.set(2.5); sch.tick();                   // fade-out scheduled at 2.0 fires
    expect(p.state).toBe('loaded');

    const again = p.toggle('1bar');               // fresh session from loaded
    expect(again.action).toBe('start');
  });
});