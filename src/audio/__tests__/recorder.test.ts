import { describe, expect, it, vi } from 'vitest';
import { Transport } from '../transport';
import { Scheduler } from '../scheduler';
import { Recorder } from '../recorder';
import type { Capturer } from '../recorder';
import { createMockClock } from './mockClock';

function makeCapture(): Capturer {
  return {
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue({} as AudioBuffer),
    dispose: vi.fn(),
  };
}

describe('recorder (quantized loop recording)', () => {
  it('arms and starts capture exactly on the grid boundary', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120); // 4/4 → 2s/bar
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const capture = makeCapture();
    const rec = new Recorder({ transport: tr, scheduler: sch, capture, now: () => clock.currentTime });

    tr.start();
    clock.set(1.0);                       // beat 2 → next 1bar boundary at t=2
    const startAt = rec.arm();
    expect(startAt).toBeCloseTo(2.0, 9);
    expect(rec.state).toBe('arming');
    expect(capture.start).not.toHaveBeenCalled();

    clock.set(1.9375); sch.tick();        // entered lookahead → scheduled
    expect(capture.start).toHaveBeenCalledWith(2.0);
    expect(rec.state).toBe('recording');
  });

  it('quantized stop happens on the next boundary after requestStop', async () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const capture = makeCapture();
    const onBuffer = vi.fn();
    const rec = new Recorder({ transport: tr, scheduler: sch, capture, now: () => clock.currentTime, onBuffer });

    tr.start();
    clock.set(0.0);
    rec.arm();                            // startAt = 0
    clock.set(0.9375); sch.tick();        // capture.start(0) now
    expect(rec.state).toBe('recording');

    clock.set(2.1);                       // requested mid-loop
    const stopAt = rec.requestStop();
    expect(stopAt).toBeCloseTo(4.0, 9);   // next 1bar boundary
    expect(rec.state).toBe('stopping');

    const buf = {} as AudioBuffer;
    (capture.stop as ReturnType<typeof vi.fn>).mockResolvedValueOnce(buf);
    clock.set(3.9375); sch.tick();        // stop scheduled
    await Promise.resolve();
    expect(capture.stop).toHaveBeenCalledWith(4.0);
    expect(rec.state).toBe('idle');
    expect(onBuffer).toHaveBeenCalledWith(buf, 0.0, 4.0);
  });

  it('never stops shorter than minBars', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const capture = makeCapture();
    const rec = new Recorder({
      transport: tr, scheduler: sch, capture, now: () => clock.currentTime,
      minBars: 2,
    });

    tr.start();
    clock.set(0.0);
    rec.arm();                            // startAt = 0
    clock.set(1.9375); sch.tick();        // recording
    clock.set(3.9);                       // wants boundary 4.0 < 2 bars (4s) → prolong
    const stopAt = rec.requestStop();
    expect(stopAt).toBeCloseTo(4.0, 9);   // startAt + 2 bars
  });

  it('count-in delays start by the configured bars', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const capture = makeCapture();
    const rec = new Recorder({
      transport: tr, scheduler: sch, capture, now: () => clock.currentTime,
      countInBars: 1,
    });
    tr.start();
    clock.set(1.0);
    const startAt = rec.arm();
    expect(startAt).toBeCloseTo(4.0, 9);  // boundary 2 + 1 bar
    clock.set(3.9375); sch.tick();
    expect(capture.start).toHaveBeenCalledWith(4.0);
  });

  it('cancel aborts an armed recording without starting capture', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const capture = makeCapture();
    const rec = new Recorder({ transport: tr, scheduler: sch, capture, now: () => clock.currentTime });
    tr.start();
    rec.arm();
    expect(rec.state).toBe('arming');
    rec.cancel();
    expect(rec.state).toBe('idle');
    clock.set(5.0); sch.tick();
    expect(capture.start).not.toHaveBeenCalled();
  });

  it('arm is ignored while armed or recording', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const capture = makeCapture();
    const rec = new Recorder({ transport: tr, scheduler: sch, capture, now: () => clock.currentTime });
    tr.start();
    const first = rec.arm();
    expect(rec.arm()).toBeNull();
    expect(first).not.toBeNull();
    clock.set(1.9375); sch.tick();
    expect(rec.arm()).toBeNull();
  });
});