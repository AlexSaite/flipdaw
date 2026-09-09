import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import {
  createSamplerVoice,
  pitchRate,
  type SamplerVoice,
  type SamplerSound,
} from '../audio/samplerVoice';
import {
  createPad,
  padWindow,
  SAMPLER_PADS,
  type SamplePad,
  type ChopMode,
  type PadMode,
} from '../sampler/model';
import { computeChops } from '../sampler/chop';
import { DecodeCache } from '../project/decodeCache';
import { useGrid } from './project';
import { toast } from './toasts';

/** Dedicated strip: sampler routes alongside clips/piano/sequencer. */
const SAMPLER_TRACK = '__sampler__';
/** Chromatic staircase base: pad i plays C4+i semitones (rate 1 at pad 0). */
const CHROMATIC_BASE = 60;

let voice: SamplerVoice | null = null;
let cache: DecodeCache | null = null;

function ensureVoice(): SamplerVoice {
  if (voice) return voice;
  const e = getEngine();
  voice = createSamplerVoice(e.ctx, e.stripFor(SAMPLER_TRACK).input);
  return voice;
}

function ensureCache(): DecodeCache {
  if (cache) return cache;
  cache = new DecodeCache(getEngine().ctx);
  return cache;
}

function freshIds(): string[] {
  return Array.from({ length: SAMPLER_PADS }, (_, i) => `s${i}`);
}

export interface SamplerStore {
  pads: SamplePad[];
  chromatic: boolean;
  chopMode: ChopMode;
  mode: PadMode;
  setChromatic(v: boolean): void;
  setChopMode(m: ChopMode): void;
  setMode(m: PadMode): void;
  /** Load a WAV file into pad i, dedup-cached and mirrored to the project dir. */
  loadSample(i: number, file: File): Promise<void>;
  /** Fire pad i at `when`-accuracy; velocity 0..1 (ADR-013 zone taps). */
  trigger(i: number, velocity: number): void;
  /** Split loaded pad i into `parts` chops across pads i.. (Koala-style). */
  chopFill(i: number, parts: number): void;
  clearPad(i: number): void;
}

export const useSampler = create<SamplerStore>((set, get) => ({
  pads: freshIds().map((id, i) => createPad(id, i)),
  chromatic: false,
  chopMode: 'equal',
  mode: 'loop',

  setChromatic(v) { set({ chromatic: v }); },
  setChopMode(m) { set({ chopMode: m }); },
  setMode(m) { set({ mode: m }); },

  async loadSample(i, file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const buf = await ensureCache().decode(bytes);
      if (!buf) {
        toast.error(`Cannot decode ${file.name}`);
        return;
      }
      const hash = await ensureCache().hashOf(bytes);
      const rel = `samples/${hash}.wav`;
      const handle = useGrid.getState().currentHandle();
      if (handle) {
        try { await handle.writeBinary(rel, bytes); } catch { toast.error('Sample write failed (read-only dir?)'); }
      }
      set((s) => ({
        pads: s.pads.map((p, idx) => idx === i ? {
          ...p, buffer: buf, file: rel, name: file.name,
        } : p),
      }));
      toast.success(`${file.name} → pad ${i + 1}`);
    } catch (e) {
      toast.error(`Load failed: ${(e as Error).message}`);
    }
  },

  trigger(i, velocity) {
    const pad = get().pads[i];
    if (!pad.buffer) return;
    const { start, end } = padWindow(pad);
    const now = getEngine().ctx.currentTime;
    const sound: SamplerSound = {
      buffer: pad.buffer,
      mode: get().mode,
      start,
      end,
      rootNote: pad.rootNote,
      gain: pad.gain,
      pitch: get().chromatic ? CHROMATIC_BASE + i : pad.rootNote,
    };
    ensureVoice().trigger(sound, velocity, now);
  },

  chopFill(i, parts) {
    const pad = get().pads[i];
    if (!pad.buffer) return;
    const data = pad.buffer.getChannelData(0);
    const chops = computeChops(pad.buffer.duration, parts, get().chopMode, data, pad.buffer.sampleRate);
    set((s) => {
      const next = s.pads.slice();
      for (let k = 0; k < chops.length; k++) {
        const idx = (i + k) % SAMPLER_PADS;
        const t = next[idx];
        next[idx] = {
          ...t,
          buffer: pad.buffer,
          file: pad.file,
          name: k === 0 ? pad.name : `${pad.name} #${k + 1}`,
          start: chops[k].start,
          end: chops[k].end,
        };
      }
      return { pads: next };
    });
  },

  clearPad(i) {
    set((s) => ({ pads: s.pads.map((p, idx) => idx === i ? createPad(p.id, i) : p) }));
  },
}));

/** Pitch rate used for pad i in chromatic mode (exported for tests/UI). */
export function chromaticPitchRate(padIndex: number): number {
  return pitchRate(60, CHROMATIC_BASE + padIndex);
}