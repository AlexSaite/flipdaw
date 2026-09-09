import { describe, expect, it, vi } from 'vitest';
import { Transport, clampBpm } from '../transport';
import { createMockClock } from './mockClock';

describe('Transport', () => {
  it('counts beats from ctx-time and bpm', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    tr.start();
    clock.advance(1);   // 120 bpm = 2 beats/sec
    expect(tr.nowBeats()).toBeCloseTo(2, 9);
    clock.advance(0.5);
    expect(tr.nowBeats()).toBeCloseTo(3, 9);
  });

  it('stop holds position, start continues from it', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    tr.start();
    clock.advance(2);   // 4 beats
    tr.stop();
    clock.advance(10);
    expect(tr.nowBeats()).toBeCloseTo(4, 9);
    tr.start();
    clock.advance(1);
    expect(tr.nowBeats()).toBeCloseTo(6, 9);
  });

  it('setBpm preserves position continuity', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    tr.start();
    clock.advance(1);   // 2 beats
    tr.setBpm(60);      // далее 1 beat/sec
    clock.advance(1);
    expect(tr.nowBeats()).toBeCloseTo(3, 9);
  });

  it('nextBoundarySec: 1bar in 4/4 @120', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    tr.start();
    clock.advance(0.3);              // beat 0.6
    // boundary = beat 4 => wait (4 - 0.6) / 2 = 1.7 c
    expect(tr.nextBoundarySec('1bar')).toBeCloseTo(2.0, 9);
  });

  it('nextBoundarySec: exactly on boundary = "now", slightly after = next', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    tr.start();
    clock.advance(1);                // exactly beat 2.0
    expect(tr.nextBoundarySec('1/4')).toBeCloseTo(1.0, 9);
    clock.advance(0.25);             // beat 2.5
    expect(tr.nextBoundarySec('1/4')).toBeCloseTo(1.5, 9); // boundary = beat 3
  });

  it('nextBoundarySec: off === now', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    tr.start();
    clock.advance(0.777);
    expect(tr.nextBoundarySec('off')).toBeCloseTo(0.777, 9);
  });

  it('notifies subscribers and unsubscribes', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const cb = vi.fn();
    const unsub = tr.subscribe(cb);
    tr.start();
    tr.setBpm(100);
    unsub();
    tr.stop();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith({ bpm: 100, timeSig: [4, 4], playing: true });
  });

  it('clampBpm keeps range 40..240', () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(999)).toBe(240);
    expect(clampBpm(123.4)).toBe(123);
  });
});
