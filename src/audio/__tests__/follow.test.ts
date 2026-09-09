import { describe, expect, it } from 'vitest';
import { Transport } from '../transport';
import { Scheduler } from '../scheduler';
import { FollowRunner, type FollowEvent } from '../follow';
import { createMockClock } from './mockClock';

describe('follow runner (scene follow-actions)', () => {
  it("'next' fires (scheduled) one bar after the scene start boundary", () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120); // 4/4 → 2s/bar
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const events: FollowEvent[] = [];
    const runner = new FollowRunner({ transport: tr, scheduler: sch, onFollow: (e) => events.push(e) });

    runner.setAction('sceneA', { type: 'next' });
    tr.start();
    runner.sceneStarted('sceneA', 64.0);

    clock.set(64.5); sch.tick();           // horizon 64.62 — still before fireAt 66.0
    expect(events).toHaveLength(0);

    clock.set(65.9375); sch.tick();        // event enters lookahead window → scheduled
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'next', scene: 'sceneA' });
  });

  it("'stop' fires one bar later with stop action", () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const events: FollowEvent[] = [];
    const runner = new FollowRunner({ transport: tr, scheduler: sch, onFollow: (e) => events.push(e) });

    runner.setAction('drums', { type: 'stop' });
    tr.start();
    runner.sceneStarted('drums', 8.0);
    clock.set(10.0); sch.tick();
    expect(events).toEqual([{ type: 'stop', scene: 'drums' }]);
  });

  it('afterBars N fires N bars after the start boundary', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 60); // 4/4 → 4s/bar
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const events: FollowEvent[] = [];
    const runner = new FollowRunner({ transport: tr, scheduler: sch, onFollow: (e) => events.push(e) });

    runner.setAction('keys', { type: 'afterBars', bars: 2 });
    tr.start();
    runner.sceneStarted('keys', 0.0);
    clock.set(3.9375); sch.tick();
    expect(events).toHaveLength(0);
    clock.set(4.0); sch.tick();              // NOT fired (needs 2 bars = 8s)
    expect(events).toHaveLength(0);
    clock.set(8.0); sch.tick();
    expect(events).toEqual([{ type: 'afterBars', bars: 2, scene: 'keys' }]);
  });

  it('replaces the pending action when a new scene starts', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const events: FollowEvent[] = [];
    const runner = new FollowRunner({ transport: tr, scheduler: sch, onFollow: (e) => events.push(e) });

    runner.setAction('A', { type: 'afterBars', bars: 2 });
    runner.setAction('B', { type: 'next' });
    tr.start();
    runner.sceneStarted('A', 0.0);      // would fire at 4.0 (after 2 bars)
    clock.set(2.0); sch.tick();
    runner.sceneStarted('B', 2.0);      // replaces: B next → fires at 4.0
    clock.set(4.0); sch.tick();
    expect(events).toEqual([{ type: 'next', scene: 'B' }]);
  });

  it('no action configured → nothing fires, scene still tracked', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
    const events: FollowEvent[] = [];
    const runner = new FollowRunner({ transport: tr, scheduler: sch, onFollow: (e) => events.push(e) });
    tr.start();
    runner.sceneStarted('A', 0.0);
    clock.set(10.0); sch.tick();
    expect(events).toHaveLength(0);
    expect(runner.currentScene).toBe('A');
  });
});