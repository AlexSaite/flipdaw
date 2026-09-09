import { describe, expect, it, vi } from 'vitest';
import { Transport } from '../transport';
import { Scheduler } from '../scheduler';
import { Arrangement } from '../../timeline/model';
import { ArrangementPlayer } from '../arrangement';
import type { TrackStrip } from '../graph';
import { createMockClock } from './mockClock';

function makeFakeSource() {
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

type FakeSource = ReturnType<typeof makeFakeSource>;

const strip = { input: {} } as unknown as TrackStrip;
const b2s = { duration: 2 } as AudioBuffer;

function setup(paths: { buffers: Map<string, AudioBuffer> }) {
  const clock = createMockClock(0);
  const tr = new Transport(clock, 120); // 2s per bar
  const sch = new Scheduler({ clock: () => clock.currentTime, lookaheadSec: 0.12 });
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 0,
    createBufferSource: () => { const s = makeFakeSource(); sources.push(s); return s; },
    createGain: () => ({
      gain: { value: 1, setTargetAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
  } as unknown as AudioContext;
  const p = new ArrangementPlayer({
    ctx,
    transport: tr,
    scheduler: sch,
    stripFor: () => strip,
    getBuffer: (id) => paths.buffers.get(id) ?? null,
    now: () => clock.currentTime,
    fadeSec: 0.01,
  });
  return { clock, tr, sch, p, sources, last: () => sources.at(-1) ?? null };
}

describe('ArrangementPlayer', () => {
  it('starts an item sample-accurately at its beat position', () => {
    const { clock, tr, sch, p, last } = setup({ buffers: new Map([['a', b2s]]) });
    const arr = new Arrangement();
    arr.addItem({ trackId: 'drums', sourceId: 'a', startBeats: 2, lengthBeats: 8 });
    p.setArrangement(arr);
    tr.start();

    clock.set(0.5); sch.tick();   // start 1.0 is outside lookahead → nothing yet
    expect(last()).toBeNull();

    clock.set(0.9); sch.tick();   // 1.0 - 0.9 = 0.1 ≤ 0.12 → enters the queue
    clock.set(1.0); sch.tick();   // startItem fires with exact=1.0
    const s = last();
    expect(s).not.toBeNull();
    expect(s!.buffer).toBe(b2s);
    expect(s!.loop).toBe(true);   // 8 beats (4s) > 2s buffer → loop to fill
    expect(s!.start).toHaveBeenCalledWith(1.0);
  });

  it('trims a clip that overruns its slot', () => {
    const { clock, tr, sch, p, last } = setup({ buffers: new Map([['a', b2s]]) });
    const arr = new Arrangement();
    // 2-beat slot = 1s, buffer 2s → hard trim (faded stop) at 1.0 + 1.0s
    arr.addItem({ trackId: 'keys', sourceId: 'a', startBeats: 0, lengthBeats: 2 });
    p.setArrangement(arr);
    tr.start();

    clock.set(0.1); sch.tick();
    clock.set(1.0); sch.tick();   // slot start 0.0 is past → catch-up start
    const s = last();
    expect(s).not.toBeNull();
    expect(s!.loop).toBe(false);
    expect(s!.start).toHaveBeenCalledWith(0);

    clock.set(2.0); sch.tick();   // stop event at 1.0 + 1.0 = 2.0
    expect(s!.stop).toHaveBeenCalled();
  });

  it('loops to fill a slot longer than the buffer', () => {
    const { clock, tr, sch, p, last } = setup({ buffers: new Map([['a', b2s]]) });
    const arr = new Arrangement();
    // 16 beats @120 = 8s slot, buffer 2s → loop to fill
    arr.addItem({ trackId: 'bass', sourceId: 'a', startBeats: 0, lengthBeats: 16 });
    p.setArrangement(arr);
    tr.start();
    clock.set(0.1); sch.tick();
    clock.set(1.0); sch.tick();
    const s = last();
    expect(s!.loop).toBe(true);
    expect(s!.stop).not.toHaveBeenCalled(); // no trim scheduled
  });
});