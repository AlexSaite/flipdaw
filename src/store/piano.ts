import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import { createPianoVoice, type PianoVoice } from '../audio/pianoVoice';
import { PianoModel } from '../piano/model';

/** Dedicated strip so the piano sits in the same mix as clips (mute/pan/gain apply). */
const PIANO_TRACK = '__piano__';

let voice: PianoVoice | null = null;

function ensureVoice(): PianoVoice {
  if (voice) return voice;
  const e = getEngine();
  voice = createPianoVoice(e.ctx, e.stripFor(PIANO_TRACK).input);
  return voice;
}

export interface ActiveNote {
  note: number;
  velocity: number;
}

export interface PianoStore {
  octave: number;
  /** MIDI notes with a finger physically held. */
  held: Set<number>;
  /** MIDI notes released while sustain was on. */
  sustained: Set<number>;
  sustain: boolean;
  setOctave(o: number): void;
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
  setSustain(v: boolean): void;
  activeNotes(): ActiveNote[];
}

export const usePiano = create<PianoStore>((set, get) => {
  const model = new PianoModel();

  return {
    octave: model.octave,
    held: new Set<number>(),
    sustained: new Set<number>(),
    sustain: false,
    setOctave(o) {
      model.setOctave(o);
      set({ octave: model.octave });
    },
    noteOn(note, velocity) {
      const v = ensureVoice();
      v.noteOn(note, velocity, getEngine().ctx.currentTime);
      set((s) => {
        const held = new Set(s.held);
        held.add(note);
        const sustained = new Set(s.sustained);
        sustained.delete(note);
        return { held, sustained };
      });
    },
    noteOff(note) {
      const sustained = get().sustain;
      const voiceNow = ensureVoice();
      if (sustained) {
        set((s) => {
          const held = new Set(s.held);
          held.delete(note);
          const sustainedSet = new Set(s.sustained);
          sustainedSet.add(note);
          return { held, sustained: sustainedSet };
        });
      } else {
        voiceNow.noteOff(note, getEngine().ctx.currentTime);
        set((s) => {
          const held = new Set(s.held);
          held.delete(note);
          return { held };
        });
      }
    },
    setSustain(v) {
      if (!v) {
        const now = getEngine().ctx.currentTime;
        const remaining = get().sustained;
        remaining.forEach((note) => voice?.noteOff(note, now));
        if (remaining.size > 0) {
          set({ sustained: new Set() });
        }
      }
      set({ sustain: v });
    },
    activeNotes() {
      const s = get();
      return [...s.held].map((note) => ({ note, velocity: 1 }));
    },
  };
});