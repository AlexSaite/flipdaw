import { describe, expect, it, vi } from 'vitest';
import { Transport } from '../transport';
import { Scheduler } from '../scheduler';
import { createMockClock } from './mockClock';

describe('quantized launch (transport + scheduler)', () => {
  it('clip starts exactly on bar boundary, cell queued before that', () => {
    const clock = createMockClock(0);
    const tr = new Transport(clock, 120);
    const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });

    tr.start();
    clock.set(0.25);                          // beat 0.5
    const boundary = tr.nextBoundarySec('1bar');
    expect(boundary).toBeCloseTo(2.0, 9);     // beat 4

    const onUiQueued = vi.fn();
    const onAudioStart = vi.fn();
    sch.uiAt(boundary, onUiQueued);           // "become playing" exactly on beat
    sch.at(boundary, onAudioStart);           // source.start(2.0)

    clock.set(1.875); sch.tick(); sch.pumpUi();   // horizon 1.995 — too early
    expect(onAudioStart).not.toHaveBeenCalled();
    expect(onUiQueued).not.toHaveBeenCalled();

    clock.set(1.9375); sch.tick(); sch.pumpUi();  // audio horizon 2.0575 — time to schedule;
    expect(onAudioStart).toHaveBeenCalledWith(2.0);
    expect(onUiQueued).not.toHaveBeenCalled();    // UI waits until now >= 2.0

    clock.set(2.0); sch.pumpUi();                 // exactly on beat — become playing
    expect(onUiQueued).toHaveBeenCalledWith(2.0);
  });
});
