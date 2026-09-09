/**
 * FlipDAW — piano model (M6.1).
 * The touch piano shows two octaves per screen; the base octave is
 * selectable and clamped to OCTAVE_MIN..OCTAVE_MAX. Naturals/accidentals
 * map straight to MIDI note numbers.
 */

export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 6;

/** Natural pitch classes within an octave. */
export const NATURALS = [0, 2, 4, 5, 7, 9, 11] as const;
/** Accidental pitch classes within an octave. */
export const ACCIDENTALS = [1, 3, 6, 8, 10] as const;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function clampOctave(o: number): number {
  return Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, Math.round(o)));
}

/** MIDI note for pitch class `pc` (0..11) in the octave whose C is `octave` (C4 → 60). */
export function midiOf(octave: number, pc: number): number {
  return 12 * (octave + 1) + pc;
}

/** Scientific pitch label, e.g. 60 → "C4". */
export function noteLabel(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export class PianoModel {
  octave: number;

  constructor(octave = 4) {
    this.octave = clampOctave(octave);
  }

  setOctave(o: number): void {
    this.octave = clampOctave(o);
  }

  /** Natural keys across the visible two octaves (14 keys). */
  naturals(): number[] {
    const out: number[] = [];
    for (let k = 0; k < 2; k++) for (const st of NATURALS) out.push(midiOf(this.octave + k, st));
    return out;
  }

  /** Accidental keys: MIDI + the white-key column index they sit after. */
  accidentals(): { midi: number; whiteAfter: number }[] {
    const out: { midi: number; whiteAfter: number }[] = [];
    for (let k = 0; k < 2; k++) {
      for (const st of ACCIDENTALS) {
        const whiteAfter = k * NATURALS.length + NATURALS.filter((n) => n < st).length;
        out.push({ midi: midiOf(this.octave + k, st), whiteAfter });
      }
    }
    return out;
  }
}