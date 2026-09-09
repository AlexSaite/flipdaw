import type { MidiChannelMessage } from './bus';
import type { Seconds } from '../audio/transport';

export const PPQ = 24;

export const BASE_NOTE = 36;
export const GRID_COLS = 8;
export const GRID_ROWS = 8;

function chanB(statusBase: number, channel: number): number {
  return (statusBase | (channel & 0x0f)) & 0xff;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

export function encodeNoteOn(note: number, velocity: number, channel = 0): Uint8Array<ArrayBuffer> {
  const n = clampInt(note, 0, 127);
  const v = clampInt(velocity, 1, 127);
  return new Uint8Array([chanB(0x90, channel), n, v]);
}

export function encodeNoteOff(note: number, channel = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([chanB(0x80, channel), clampInt(note, 0, 127), 0]);
}

export function encodeCc(cc: number, value: number, channel = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array([chanB(0xb0, channel), clampInt(cc, 0, 127), clampInt(value, 0, 127)]);
}

export function encodeRealtime(kind: 'clock' | 'start' | 'stop' | 'continue'): Uint8Array<ArrayBuffer> {
  const byte = kind === 'clock' ? 0xf8 : kind === 'start' ? 0xfa : kind === 'continue' ? 0xfb : 0xfc;
  return new Uint8Array([byte]);
}

/** Decode a single MIDI message. Realtime single-byte messages need no length check. */
export function decodeMidiMessage(bytes: Uint8Array, channel = 0): MidiChannelMessage | null {
  if (bytes.length === 1) {
    switch (bytes[0]) {
      case 0xf8: return { kind: 'clock' };
      case 0xfa: return { kind: 'start' };
      case 0xfb: return { kind: 'continue' };
      case 0xfc: return { kind: 'stop' };
      default: return null;
    }
  }
  if (bytes.length < 3) return null;
  const status = bytes[0];
  const chan = status & 0x0f;
  if (chan !== channel) return null;
  const base = status & 0xf0;
  if (base === 0x90 && bytes[2] > 0) return { kind: 'noteOn', note: bytes[1], velocity: bytes[2] };
  if (base === 0x80 || (base === 0x90 && bytes[2] === 0)) return { kind: 'noteOff', note: bytes[1] };
  if (base === 0xb0) return { kind: 'cc', cc: bytes[1], value: bytes[2] };
  return null;
}

/** Grid pad note: rows are tracks, columns are scenes (Launchpad-style). */
export function noteForCell(trackIdx: number, scene: number): number | null {
  if (trackIdx < 0 || trackIdx >= GRID_ROWS || scene < 0 || scene >= GRID_COLS) return null;
  return BASE_NOTE + scene + trackIdx * GRID_COLS;
}

export function cellFromNote(note: number): { trackIdx: number; scene: number } | null {
  const rel = note - BASE_NOTE;
  if (rel < 0) return null;
  const trackIdx = Math.floor(rel / GRID_COLS);
  const scene = rel % GRID_COLS;
  if (trackIdx >= GRID_ROWS) return null;
  return { trackIdx, scene };
}

/** Track fader ↔ CC 0..GRID_ROWS-1. */
export function ccForTrack(trackIdx: number): number | null {
  if (trackIdx < 0 || trackIdx >= GRID_ROWS) return null;
  return trackIdx;
}

export function trackFromCc(cc: number): number | null {
  if (cc < 0 || cc >= GRID_ROWS) return null;
  return cc;
}

/** Seconds of each sub-beat clock tick within one beat (24 ppq). */
export function clockTickTimes(bpm: number, beatStartSec: Seconds, ticksPerBeat = PPQ): number[] {
  const perTick = 60 / bpm / ticksPerBeat;
  return Array.from({ length: ticksPerBeat }, (_, i) => beatStartSec + i * perTick);
}

export interface ScheduleSink {
  at(sec: Seconds, fn: () => void): void;
}

export interface ClockOutClock {
  now(): Seconds;
  bpm(): number;
}

/**
 * Sends MIDI realtime clock (24 ppq) anchored to transport time.
 * Ticks are always derived from clock.bpm()/now() — never accumulated,
 * so there is no drift over a long session (acceptance: ≤1 ms / 10 min).
 */
export class MidiClockOut {
  private playing = false;
  private nextTick: Seconds | null = null;
  private readonly sink: ScheduleSink;
  private readonly clock: ClockOutClock;
  private readonly sendTick: () => void;
  private readonly sendStart?: () => void;
  private readonly sendStop?: () => void;

  constructor(
    sink: ScheduleSink,
    clock: ClockOutClock,
    sendTick: () => void,
    sendStart?: () => void,
    sendStop?: () => void,
  ) {
    this.sink = sink;
    this.clock = clock;
    this.sendTick = sendTick;
    this.sendStart = sendStart;
    this.sendStop = sendStop;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.sendStart?.();
    this.nextTick = this.clock.now();
    this.scheduleNext();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.nextTick = null;
    this.sendStop?.();
  }

  get running(): boolean { return this.playing; }

  private scheduleNext(): void {
    if (!this.playing || this.nextTick === null) return;
    const t = this.nextTick;
    this.nextTick += 60 / this.clock.bpm() / PPQ;
    this.sink.at(t, () => {
      this.sendTick();
      this.scheduleNext();
    });
  }
}

/** Estimates incoming MIDI clock tempo from tick arrival times. */
export class ClockInput {
  private lastTickAt: Seconds | null = null;
  private intervalSum = 0;
  private intervalCount = 0;

  /** Feed a tick arrival (called with the *tick* time, e.g. ctx.currentTime). */
  tick(at: Seconds): void {
    if (this.lastTickAt !== null) {
      const dt = at - this.lastTickAt;
      if (dt > 0 && dt < 1) { // ignore gaps >1s (clock restart)
        this.intervalSum += dt;
        this.intervalCount++;
      }
    }
    this.lastTickAt = at;
  }

  reset(): void {
    this.lastTickAt = null;
    this.intervalSum = 0;
    this.intervalCount = 0;
  }

  /** Estimated BPM from the last 24 tick intervals (one beat). 0 = no data. */
  bpm(): number {
    if (this.intervalCount === 0) return 0;
    const perBeat = (this.intervalSum / this.intervalCount) * PPQ;
    return 60 / perBeat;
  }
}