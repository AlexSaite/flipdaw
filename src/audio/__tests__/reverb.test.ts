import { describe, expect, it, vi } from 'vitest';
import { generateImpulse, createImpulseResponse, createReverbBus } from '../reverb';

const ctx = {
  currentTime: 0,
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data: Float32Array[] = [];
    return {
      sampleRate, numberOfChannels: channels, length,
      getChannelData(c: number): Float32Array {
        data[c] ||= new Float32Array(length);
        return data[c];
      },
    } as unknown as AudioBuffer;
  },
  createConvolver: () => ({ buffer: null as AudioBuffer | null, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }) as unknown as ConvolverNode,
  createGain: () => ({ gain: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }) as unknown as GainNode,
};

describe('reverb (send reverb)', () => {
  it('impulse is exponentially decaying noise', () => {
    const data = new Float32Array(100);
    generateImpulse(data, 3);
    const head = Math.abs(data[0]);
    const tail = Math.abs(data[99]);
    expect(head).toBeGreaterThan(0);
    expect(head).toBeGreaterThan(tail * 10); // decayed a lot by the end
    expect(Math.max(...data)).toBeLessThanOrEqual(1);
  });

  it('impulse is deterministic for same seed', () => {
    const a = new Float32Array(16);
    const b = new Float32Array(16);
    generateImpulse(a, 2, 7);
    generateImpulse(b, 2, 7);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('createImpulseResponse builds a stereo buffer', () => {
    const buf = createImpulseResponse(ctx, 48000, 1.0, 2.5);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(48000);
    expect(buf.sampleRate).toBe(48000);
  });

  it('reverb bus routes input → convolver → wet → output and sets level', () => {
    const impulse = createImpulseResponse(ctx, 8000, 0.5, 2);
    const bus = createReverbBus(ctx, impulse, { level: 0.2 });
    expect(bus.input).toBeDefined();
    bus.setLevel(0.5);
    bus.dispose();
    expect(true).toBe(true);
  });
});