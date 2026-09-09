import { describe, expect, it } from 'vitest';
import { Transport } from '../../audio/transport';
import { Scheduler } from '../../audio/scheduler';
import { ChainRunner } from '../chain';
import { createMockClock } from '../../audio/__tests__/mockClock';

function setup() {
  const clock = createMockClock(0);
  const tr = new Transport(clock, 120); // bar = 2 s, 4 beats
  const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
  const events: { patternId: string; atBeats: number }[] = [];
  const runner = new ChainRunner({
    transport: tr,
    scheduler: sch,
    onPatternChanged: (patternId, atBeats) => events.push({ patternId, atBeats }),
  });
  return { clock, tr, sch, runner, events };
}

describe('ChainRunner (pattern chaining)', () => {
  it('advances bar-by-bar through the chain on the grid', () => {
    const { clock, tr, sch, runner, events } = setup();
    runner.setChain([
      { patternId: 'p1', bars: 2 },
      { patternId: 'p2', bars: 1 },
      { patternId: 'p3', bars: 1 },
    ]);
    tr.start();
    runner.start(0); // p1 plays beats 0..8

    // p1 → p2 must switch at beat 8 (2 bars); drain several ticks past it
    for (const t of [0.1, 1.9, 2.0, 2.01, 3.5, 4.5, 6.0]) {
      clock.set(t); sch.tick();
    }
    expect(events).toContainEqual({ patternId: 'p2', atBeats: 8 });

    // advance to beat 12 → p3, beat 16 → wraps back to p1
    for (const t of [6.5, 8.0, 10.0, 12.0]) { clock.set(t); sch.tick(); }
    expect(events).toContainEqual({ patternId: 'p3', atBeats: 12 });
    expect(events).toContainEqual({ patternId: 'p1', atBeats: 16 });
  });

  it('jumpTo selects a pattern without rescheduling', () => {
    const { runner } = setup();
    runner.setChain([
      { patternId: 'a', bars: 1 },
      { patternId: 'b', bars: 1 },
      { patternId: 'c', bars: 1 },
    ]);
    runner.jumpTo('c');
    expect(runner.current?.patternId).toBe('c');
  });

  it('empty chain stays inert', () => {
    const { clock, tr, sch, runner, events } = setup();
    runner.start(0);
    tr.start();
    clock.set(10); sch.tick();
    expect(events).toHaveLength(0);
  });
});