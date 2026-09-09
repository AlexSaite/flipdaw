import { describe, expect, it } from 'vitest';
import { PianoModel, midiOf, noteLabel, OCTAVE_MAX, OCTAVE_MIN } from '../model';

describe('PianoModel', () => {
  it('clamps the base octave to the supported range', () => {
    expect(new PianoModel(7).octave).toBe(OCTAVE_MAX);
    expect(new PianoModel(0).octave).toBe(OCTAVE_MIN);
    expect(new PianoModel(4.6).octave).toBe(5);
  });

  it('setOctave clamps', () => {
    const m = new PianoModel(4);
    m.setOctave(9);
    expect(m.octave).toBe(OCTAVE_MAX);
    m.setOctave(1);
    expect(m.octave).toBe(OCTAVE_MIN);
  });

  it('naturals() returns two octaves starting at C', () => {
    const m = new PianoModel(4);
    const notes = m.naturals();
    expect(notes).toHaveLength(14);
    expect(notes[0]).toBe(60); // C4
    expect(notes[1]).toBe(62); // D4
    expect(notes[6]).toBe(71); // B4
    expect(notes[7]).toBe(72); // C5
    expect(notes[13]).toBe(83); // B5
  });

  it('accidentals() names the white column each black key sits after', () => {
    const m = new PianoModel(4);
    const a = m.accidentals();
    expect(a).toHaveLength(10);
    expect(a[0]).toEqual({ midi: 61, whiteAfter: 1 });       // C#4 after C
    expect(a[1]).toEqual({ midi: 63, whiteAfter: 2 });       // D#4 after D
    expect(a[2]).toEqual({ midi: 66, whiteAfter: 4 });       // F#4 after F
    expect(a[4]).toEqual({ midi: 70, whiteAfter: 6 });       // A#4 after A
    expect(a[9]).toEqual({ midi: 82, whiteAfter: 13 });      // A#5 after A5
  });

  it('midiOf and noteLabel map holes correctly', () => {
    expect(midiOf(4, 0)).toBe(60);
    expect(noteLabel(60)).toBe('C4');
    expect(noteLabel(61)).toBe('C#4');
    expect(noteLabel(69)).toBe('A4');
    expect(noteLabel(72)).toBe('C5');
  });
});