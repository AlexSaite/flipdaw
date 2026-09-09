/**
 * FlipDAW — JUCE core bridge client (M5 spike).
 * JSON-lines IPC to a C++ host (see spike/juce-core/protocol.md).
 * ADR-001: RTT/ping uses AudioContext.currentTime (same host monotonic clock
 * as the core when both run on this machine — that is the whole point of the
 * on-box |spike|: no wall-clock anywhere near the audio path).
 *
 * ADR-010 swap seam: `setEngineOverride()` (engine.ts) lets the store keep
 * calling `getEngine()` while this client stands in for transport/control.
 * Buffer playback remains local Web Audio in the MVP; the core owns the
 * arrangement DSP once the IPC path is validated.
 */

import type { Quantize, Seconds } from './transport';

export const CORE_PROTOCOL_VERSION = 1;

/** Transport-agnostic duplex — lets tests inject an in-memory channel. */
export interface CoreChannel {
  send(line: string): void;
  onMessage(cb: (line: string) => void): () => void;
  close(): void;
}

export interface PingSample {
  sentAt: Seconds;
  rtt: Seconds; // measured on the local clock; ~same host as core
}

export interface LatencyStats {
  samples: number;
  min: Seconds;
  max: Seconds;
  avg: Seconds;
  jitter: Seconds;   // max - min (target ≤ 0.001s)
  p99: Seconds;
}

export type CoreCommand =
  | { t: 'transport.start' }
  | { t: 'transport.stop' }
  | { t: 'transport.panic' }
  | { t: 'transport.bpm'; bpm: number }
  | { t: 'cell.launch'; cellId: string; quantize: Quantize; atBeat: number }
  | { t: 'arrangement.load'; version: number }
  | { t: 'ping'; sentAt: Seconds };

export class CoreClientEngine {
  private readonly channel: CoreChannel;
  private readonly now: () => Seconds;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private ready: Promise<void>;
  private pings: PingSample[] = [];

  /** @param now monotonic clock for RTT; defaults to ctx-ish monotonic. */
  constructor(channel: CoreChannel, now: () => Seconds) {
    this.channel = channel;
    this.now = now;
    channel.onMessage((line) => this.dispatch(line));
    this.ready = this.handshake();
  }

  get isReady(): Promise<void> { return this.ready; }

  ping(): void {
    const sentAt = this.now();
    this.send({ t: 'ping', sentAt } as CoreCommand);
  }

  /** RTT samples so far. Used by the UI's "link health" badge. */
  get latencyStats(): LatencyStats {
    const xs = this.pings.map((p) => p.rtt);
    const n = xs.length;
    if (n === 0) return { samples: 0, min: 0, max: 0, avg: 0, jitter: 0, p99: 0 };
    const sorted = [...xs].sort((a, b) => a - b);
    const avg = xs.reduce((a, b) => a + b, 0) / n;
    const min = sorted[0];
    const max = sorted[n - 1];
    const p99 = sorted[Math.min(n - 1, Math.ceil(n * 0.99) - 1)];
    return { samples: n, min, max, avg, jitter: max - min, p99 };
  }

  start(): void { this.send({ t: 'transport.start' }); }
  stop(): void { this.send({ t: 'transport.stop' }); }
  panic(): void { this.send({ t: 'transport.panic' }); }
  setBpm(bpm: number): void { this.send({ t: 'transport.bpm', bpm }); }
  launchCell(cellId: string, quantize: Quantize, atBeat: number): void {
    this.send({ t: 'cell.launch', cellId, quantize, atBeat });
  }
  loadArrangement(version: number): void { this.send({ t: 'arrangement.load', version }); }

  close(): void { this.channel.close(); }

  private handshake(): Promise<void> {
    return new Promise((resolve) => {
      this.pending.set(0, { resolve: () => resolve(), reject: () => resolve() });
      this.send({ t: 'hello', v: CORE_PROTOCOL_VERSION });
    });
  }

  private dispatch(line: string): void {
    let msg: { t: string; seq?: number; sentAt?: number; rtt?: number };
    try { msg = JSON.parse(line); } catch { return; } // stream noise → drop

    if (msg.t === 'hello') {
      const p = this.pending.get(0);
      if (p) { p.resolve(undefined); this.pending.delete(0); }
      return;
    }
    if (msg.t === 'pong' && msg.seq !== undefined) {
      const p = this.pending.get(msg.seq);
      if (!p) return;
      p.resolve(undefined);
      this.pending.delete(msg.seq);
      return;
    }
    if (msg.t === 'error' && msg.seq !== undefined) {
      const p = this.pending.get(msg.seq);
      if (!p) return;
      p.reject(new Error(`core error: ${line}`));
      this.pending.delete(msg.seq);
    }
  }

  private send(msg: object): void {
    const m = { ...msg, seq: this.seq++ } as CoreCommand & { seq: number };
    if (m.t === 'ping') {
      const sentAt = this.now();
      m.sentAt = sentAt;
      this.pending.set(m.seq, {
        resolve: () => this.pings.push({ sentAt, rtt: this.now() - sentAt }),
        reject: () => undefined,
      });
      this.channel.send(JSON.stringify(m));
      return;
    }
    if (!this.pending.has(m.seq)) {
      this.pending.set(m.seq, { resolve: () => undefined, reject: () => undefined });
    }
    this.channel.send(JSON.stringify(m));
  }
}