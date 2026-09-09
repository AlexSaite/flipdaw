import { describe, expect, it } from 'vitest';
import { CoreClientEngine, CORE_PROTOCOL_VERSION, type CoreChannel } from '../coreClient';

/** In-memory duplex: the fake core echoes pongs with a delay. */
function makeChannel(delaySec = 0) {
  let ack: ((line: string) => void) | null = null;
  let t = 0; // fake monotonic clock
  const sent: object[] = [];
  const channel: CoreChannel = {
    send(line) {
      sent.push(JSON.parse(line));
      const msg = JSON.parse(line) as { t: string; seq?: number };
      // handshake + pong echo after a controlled delay (advances the fake clock too)
      setTimeout(() => {
        t += delaySec;
        if (msg.t === 'hello') ack?.(JSON.stringify({ t: 'hello', v: CORE_PROTOCOL_VERSION }));
        if (msg.t === 'ping') ack?.(JSON.stringify({ t: 'pong', seq: msg.seq }));
      }, delaySec * 1000);
    },
    onMessage(cb) { ack = cb; return () => { ack = null; }; },
    close() { ack = null; },
  };
  return {
    channel,
    clock: { advance: (s: number) => { t += s; }, get now() { return t; } },
    sent,
  };
}

describe('CoreClientEngine (JUCE spike bridge)', () => {
  it('handshakes with the core on connect', async () => {
    const { channel, clock, sent } = makeChannel();
    const core = new CoreClientEngine(channel, () => clock.now);
    await core.isReady;
    const hello = sent.find((m) => (m as { t: string }).t === 'hello') as { t: string; v: number };
    expect(hello.v).toBe(CORE_PROTOCOL_VERSION);
  });

  it('round-trips pings and reports jitter stats', async () => {
    const { channel, clock, sent } = makeChannel(0.002);
    const core = new CoreClientEngine(channel, () => clock.now);
    await core.isReady;

    for (let i = 0; i < 10; i++) { core.ping(); await new Promise((r) => setTimeout(r, 5)); }
    const ackMsg = sent.find((m) => (m as { t: string }).t === 'ping') as { t: string };
    void ackMsg;
    await new Promise((r) => setTimeout(r, 30)); // let echoes land

    const s = core.latencyStats;
    expect(s.samples).toBeGreaterThanOrEqual(9);
    expect(s.avg).toBeGreaterThan(0.0018); // ≥ delay
    expect(s.jitter).toBeLessThan(0.005);  // fake channel is stable
    expect(s.max).toBeGreaterThanOrEqual(s.min);
  });

  it('forwards control commands verbatim', () => {
    const { channel, clock, sent } = makeChannel();
    const core = new CoreClientEngine(channel, () => clock.now);
    core.setBpm(155);
    core.launchCell('drums-0', '1bar', 4);
    const bpm = sent.find((m) => (m as { t: string }).t === 'transport.bpm') as { bpm: number };
    const launch = sent.find((m) => (m as { t: string }).t === 'cell.launch') as { cellId: string; quantize: string; atBeat: number };
    expect(bpm.bpm).toBe(155);
    expect(launch.cellId).toBe('drums-0');
    expect(launch.quantize).toBe('1bar');
    expect(launch.atBeat).toBe(4);
  });
});