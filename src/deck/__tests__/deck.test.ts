import { describe, expect, it } from 'vitest';
import { Deck } from '../deck';
import { Transport } from '../../audio/transport';
import { createMockClock } from '../../audio/__tests__/mockClock';
import type { EventHandle, Scheduler } from '../../audio/scheduler';

interface FakeSource {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  loop: boolean;
  startCalls: number[];
  stopCalls: number[];
  onended: (() => void) | null;
  connect(): void;
  start(t: number): void;
  stop(t: number): void;
}

function makeHarness() {
  const clock = createMockClock();
  const transport = new Transport(clock, 120); // 0.5 s/beat
  const sources: FakeSource[] = [];
  const ctx = {
    get currentTime() { return clock.currentTime; },
    createBufferSource(): FakeSource {
      const s: FakeSource & { start(t: number): void; stop(t: number): void } = {
        buffer: null,
        playbackRate: { value: 1 },
        loop: false,
        startCalls: [],
        stopCalls: [],
        onended: null,
        connect() {},
        start(t: number) { s.startCalls.push(t); },
        stop(t: number) { s.stopCalls.push(t); },
      };
      sources.push(s);
      return s;
    },
    createGain() {
      return {
        gain: { value: 1, setTargetAtTime() {}, setValueAtTime() {} },
        connect() {},
        disconnect() {},
      } as unknown as GainNode;
    },
  } as unknown as AudioContext;

  const events: { time: number; fn: (t: number) => void; dead: boolean }[] = [];
  const scheduler = {
    at(time: number, fn: (t: number) => void): EventHandle {
      const ev = { time, fn, dead: false };
      events.push(ev);
      return { cancel() { ev.dead = true; } };
    },
  } as unknown as Scheduler;

  const fire = (horizon: number): void => {
    const ready = events
      .filter((e) => !e.dead && e.time <= horizon)
      .sort((a, b) => a.time - b.time);
    for (const e of ready) {
      e.dead = true;
      e.fn(e.time);
    }
  };

  const input = { connect() {} } as unknown as AudioNode;
  const deck = new Deck({ ctx, transport, scheduler, input });
  return { clock, transport, deck, sources, fire };
}

const buff = { duration: 4.0 } as AudioBuffer;

describe('Deck player', () => {
  it('play lands on the bar boundary with rate 1.0', () => {
    const { clock, transport, deck, sources, fire } = makeHarness();
    clock.set(0);
    transport.start();
    deck.load(buff);
    clock.advance(0.1); // 0.2 beats in
    const at = deck.play('1bar');
    expect(at).toBeCloseTo(2.0, 6); // beat 4 @ 120 bpm
    fire(2.0);
    expect(sources).toHaveLength(1);
    expect(sources[0].startCalls[0]).toBeCloseTo(2.0, 6);
    expect(sources[0].playbackRate.value).toBe(1);
    expect(deck.state).toBe('playing');
  });

  it('play with no buffer is a no-op', () => {
    const { deck } = makeHarness();
    expect(deck.play('1bar')).toBeNull();
    expect(deck.state).toBe('empty');
  });

  it('pause stops on the next bar boundary', () => {
    const { clock, transport, deck, sources, fire } = makeHarness();
    clock.set(0);
    transport.start();
    deck.load(buff);
    clock.advance(0.1);
    deck.play('1bar');
    fire(2.0);
    expect(deck.state).toBe('playing');
    clock.set(3.0); // beat 6
    const at = deck.pause('1bar');
    expect(at).toBeCloseTo(4.0, 6); // beat 8
    fire(4.0);
    expect(sources[0].stopCalls[0]).toBeCloseTo(4.0 + 2 * 0.012, 6); // fade tail past boundary
    expect(deck.state).toBe('stopped');
  });

  it('sync relaunches at the transport bar boundary (rate stays 1.0)', () => {
    const { clock, transport, deck, sources, fire } = makeHarness();
    clock.set(0);
    transport.start();
    deck.load(buff);
    clock.advance(0.4); // 0.8 beats
    const at = deck.sync();
    expect(at).toBeCloseTo(2.0, 6);
    fire(2.0);
    expect(sources[0].startCalls[0]).toBeCloseTo(2.0, 6);
    expect(sources[0].playbackRate.value).toBe(1);
  });

  it('hot cue jumps sample-accurately', () => {
    const { clock, transport, deck, sources, fire } = makeHarness();
    clock.set(0);
    transport.start();
    deck.load(buff);
    clock.advance(0.1);
    deck.play('1bar');
    fire(2.0);
    deck.cueAt(8);
    clock.set(5.0); // nowBeats = 10 → seek(8) clamps to now
    deck.jumpCue();
    expect(sources).toHaveLength(2);
    expect(sources[1].startCalls[0]).toBeCloseTo(5.0, 6);
    expect(deck.state).toBe('playing');
  });

  it('loop wraps back to the loop start on the boundary', () => {
    const { clock, transport, deck, sources, fire } = makeHarness();
    clock.set(0);
    transport.start();
    deck.load(buff);
    deck.setLoop(4);
    clock.advance(0.1);
    deck.play('1bar'); // start at beat boundary 4 → at 2.0
    expect(deck.loopBeats).toBe(4);
    clock.set(2.0);
    fire(2.0);         // src0 @2.0 from beat 4, wrap scheduled at beat 8
    expect(sources[0].startCalls[0]).toBeCloseTo(2.0, 6);
    clock.set(4.0);
    fire(4.0);         // wrap → src1 @4.0 back at beat 4
    expect(sources[1].startCalls[0]).toBeCloseTo(4.0, 6);
    clock.set(6.0);
    fire(6.0);         // second wrap → src2 @6.0
    expect(sources[2].startCalls[0]).toBeCloseTo(6.0, 6);
    expect(sources).toHaveLength(3);
    expect(deck.progress(6.0)).toBeCloseTo(0, 6); // folded back to loop start
  });
});