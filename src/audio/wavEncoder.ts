/**
 * FlipDAW — PCM16 WAV encoder (recorded loops → samples/).
 * Pure function over channel data: no AudioContext dependency, unit-testable.
 */

export interface WavSource {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(c: number): Float32Array;
}

function writeStr(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/** Encode a buffer as 44-byte-header PCM16 WAV (interleaved). */
export function encodeWav(src: WavSource): ArrayBuffer {
  const numCh = src.numberOfChannels;
  const sampleRate = src.sampleRate;
  const samples = src.getChannelData(0).length;
  const blockAlign = numCh * 2;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);            // fmt chunk size
  view.setUint16(20, 1, true);             // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);            // bit depth
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = src.getChannelData(c)[i];
      const clamp = Math.max(-1, Math.min(1, s));
      view.setInt16(off, clamp < 0 ? clamp * 0x8000 : clamp * 0x7fff, true);
      off += 2;
    }
  }
  return buffer;
}

/** Parse the header to sanity-check an encoded WAV. */
export function readWavHeader(buf: ArrayBuffer): {
  sampleRate: number; numberOfChannels: number; samples: number; bitsPerSample: number;
} | null {
  const view = new DataView(buf);
  if (buf.byteLength < 44) return null;
  if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'RIFF') return null;
  if (String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)) !== 'WAVE') return null;
  return {
    sampleRate: view.getUint32(24, true),
    numberOfChannels: view.getUint16(22, true),
    samples: view.getUint32(40, true) / (view.getUint16(22, true) * 2),
    bitsPerSample: view.getUint16(34, true),
  };
}