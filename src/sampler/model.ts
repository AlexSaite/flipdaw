/**
 * FlipDAW — sampler model (M6.2).
 * An 8-pad (4x2) kit over decoded WAV buffers. Pads carry a chop range in
 * seconds ([start,end]) — 0 start = sample head, 0 end = buffer duration.
 * rootNote is the pitch anchor: in chromatic mode pads play a semitone
 * staircase above/below it via playbackRate.
 */

export const SAMPLER_PADS = 8;

export type PadMode = 'oneshot' | 'loop';
export type ChopMode = 'equal' | 'lazy';

export interface SamplePad {
  id: string;
  name: string;
  /** samples/<sha256>.wav ('' until a sample is loaded). */
  file: string;
  buffer: AudioBuffer | null;
  mode: PadMode;
  /** Chop window in seconds (start seconds into the sample). */
  start: number;
  /** Chop window end in seconds; 0 = whole sample. */
  end: number;
  /** Pitch anchor: rate 1 plays at this MIDI note. */
  rootNote: number;
  gain: number;
}

export function createPad(id: string, index: number): SamplePad {
  return {
    id,
    name: `Pad ${index + 1}`,
    file: '',
    buffer: null,
    mode: 'loop',
    start: 0,
    end: 0,
    rootNote: 60,
    gain: 0.9,
  };
}

/** Chop window of a pad over its buffer (resolves end=0 → duration). */
export function padWindow(pad: SamplePad): { start: number; end: number } {
  const duration = pad.buffer?.duration ?? 0;
  const start = Math.min(Math.max(0, pad.start), duration);
  const end = pad.end > start ? Math.min(pad.end, duration) : duration;
  return { start, end };
}