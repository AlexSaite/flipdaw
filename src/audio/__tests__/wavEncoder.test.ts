import { describe, expect, it } from 'vitest';
import { encodeWav, readWavHeader } from '../wavEncoder';

describe('wavEncoder (PCM16)', () => {
  it('writes a valid 44-byte header', () => {
    const src = {
      sampleRate: 48000,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(0),
    };
    const wav = encodeWav(src);
    expect(wav.byteLength).toBe(44);
    const h = readWavHeader(wav);
    expect(h).toEqual({ sampleRate: 48000, numberOfChannels: 2, samples: 0, bitsPerSample: 16 });
  });

  it('interleaves and encodes samples with correct order', () => {
    // 2 channels, 4 samples per channel
    const data = [new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([-1, 0.25, 0, 0.75])];
    const src = { sampleRate: 44100, numberOfChannels: 2, getChannelData: (c: number) => data[c] };
    const wav = encodeWav(src);
    expect(readWavHeader(wav)).toEqual({ sampleRate: 44100, numberOfChannels: 2, samples: 4, bitsPerSample: 16 });

    const view = new DataView(wav);
    // interleaved: frame = [ch0, ch1] (PCM16 truncates toward zero)
    expect(view.getInt16(44, true)).toBe(0);          // 0
    expect(view.getInt16(46, true)).toBe(-32768);     // -1
    expect(view.getInt16(48, true)).toBe(16383);      // 0.5
    expect(view.getInt16(50, true)).toBe(8191);       // 0.25
    expect(view.getInt16(52, true)).toBe(-16384);     // -0.5
    expect(view.getInt16(54, true)).toBe(0);          // 0
    expect(view.getInt16(56, true)).toBe(32767);      // 1 → clamped +0x7fff
    expect(view.getInt16(58, true)).toBe(24575);      // 0.75
  });

  it('clamps out-of-range samples', () => {
    const src = {
      sampleRate: 8000,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array([2, -2]),
    };
    const wav = encodeWav(src);
    const view = new DataView(wav);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});