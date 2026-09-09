import { describe, expect, it, vi } from 'vitest';
import { Scheduler } from '../scheduler';
import { createMockClock } from './mockClock';

const mkSch = (clock: { currentTime: number }) =>
  new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });

describe('Scheduler', () => {
  it('audio event fires only after entering lookahead window', () => {
    const clock = createMockClock(0);
    const sch = mkSch(clock);
    const fn = vi.fn();
    sch.at(0.5, fn);
    sch.tick();                    // horizon = 0.12 — too early
    expect(fn).not.toHaveBeenCalled();
    clock.set(0.4);                // horizon = 0.52 >= 0.5
    sch.tick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0.5); // EXACT time, not "now"
  });

  it('events fire in time order', () => {
    const clock = createMockClock(0);
    const sch = mkSch(clock);
    const order: number[] = [];
    sch.at(0.5, () => order.push(2));
    sch.at(0.45, () => order.push(1));
    clock.set(0.4);
    sch.tick();
    expect(order).toEqual([1, 2]);
  });

  it('cancel cancels an event', () => {
    const clock = createMockClock(0);
    const sch = mkSch(clock);
    const fn = vi.fn();
    sch.at(0.05, fn).cancel();
    sch.tick();
    expect(fn).not.toHaveBeenCalled();
  });

  it('UI events are not touched by tick and fire in pumpUi', () => {
    const clock = createMockClock(0);
    const sch = mkSch(clock);
    const fn = vi.fn();
    sch.uiAt(0.3, fn);
    clock.set(0.5);
    sch.tick();
    expect(fn).not.toHaveBeenCalled();
    sch.pumpUi();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('start() attaches tick to setInterval (fake timers)', () => {
    vi.useFakeTimers();
    try {
      const clock = createMockClock(0);
      const sch = new Scheduler({ clock: () => clock.currentTime, tickMs: 25 });
      const fn = vi.fn();
      sch.at(0.1, fn);
      sch.start();
      vi.advanceTimersByTime(25);  // tick: horizon 0.12 >= 0.1
      expect(fn).toHaveBeenCalledTimes(1);
      sch.stop();
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop() clears queues', () => {
    const clock = createMockClock(0);
    const sch = mkSch(clock);
    const fn = vi.fn();
    sch.at(0.01, fn);
    sch.stop();
    sch.tick();
    expect(fn).not.toHaveBeenCalled();
  });
});
