import type { AudioClock } from '../transport';

export interface MockClock extends AudioClock {
  advance(sec: number): void;
  set(sec: number): void;
}

/** Manually-driven clock: no test depends on real time. */
export function createMockClock(start = 0): MockClock {
  let t = start;
  return {
    get currentTime() { return t; },
    advance(sec: number) { t += sec; },
    set(sec: number) { t = sec; },
  };
}
