import { describe, expect, it } from 'vitest';
import { encodeOscMessage, decodeOscMessage } from '../osc';

function args(...tuples: Array<['i' | 'f' | 's', number | string]>) {
  return tuples.map(([type, value]) => ({ type, value }));
}

describe('osc codec (OSC 1.0)', () => {
  it('round-trips int, float and string args', () => {
    const msg = {
      address: '/scene/1',
      args: args(['i', 7], ['f', 0.5], ['s', 'beat']),
    };
    const round = decodeOscMessage(encodeOscMessage(msg));
    expect(round).toEqual(msg);
  });

  it('round-trips a bare float (e.g. bpm)', () => {
    const msg = { address: '/bpm', args: args(['f', 0.5]) };
    const round = decodeOscMessage(encodeOscMessage(msg));
    expect(round).toEqual(msg);
  });

  it('zero-pads every element to a multiple of 4 bytes', () => {
    const bytes = encodeOscMessage({ address: '/x', args: args(['s', 'abcz']) });
    // "/x\0\0" (4) + ",\0\0\0" (4) + "abc\0z\0\0\0" (8) = 16
    expect(bytes.length).toBe(16);
    expect(bytes.length % 4).toBe(0);
  });

  it('rejects a non-address packet', () => {
    expect(decodeOscMessage(new Uint8Array([0, 0, 0, 0]))).toBeNull();
  });

  it('rejects an unsupported type tag', () => {
    const msg = { address: '/b', args: args(['i', 1]) };
    const bytes = encodeOscMessage(msg);
    const hex = Array.from(bytes);
    // patch tag byte 'i' -> 'd' (double, unsupported)
    const tagIdx = 5; // after "/b\0\0" (4) + "," (1)
    const patched = new Uint8Array(hex);
    patched[tagIdx] = 0x64;
    expect(decodeOscMessage(patched)).toBeNull();
  });

  it('keeps negative ints exact', () => {
    const msg = { address: '/note/-3', args: args(['i', -3]) };
    const round = decodeOscMessage(encodeOscMessage(msg));
    expect(round?.args[0].value).toBe(-3);
  });
});