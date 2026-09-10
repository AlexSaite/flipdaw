import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import { TurntablePlayer, TT_MIN_RATE, TT_MAX_RATE, type PlatterState } from '../audio/turntable';
import { DecodeCache } from '../project/decodeCache';
import { computePeaks, type Peaks } from '../project/thumbs';
import { useGrid } from './project';
import { toast } from './toasts';

/**
 * Single-platter turntable store (M7). Loads a WAV from the grid or disk,
 * spins/stops the record, pitches 50–160%, scrubs sample-accurately.
 * Free-running — the platter does not follow the transport grid.
 */

export interface TurntableVM {
  name: string;
  file: string;
  state: PlatterState;
  rate: number;
  gain: number;
  peaks: Peaks | null;
}

interface TurntableStore {
  vm: TurntableVM;
  loadFromCell(cellId: string): Promise<void>;
  loadFile(file: File): Promise<void>;
  spin(): void;
  stop(): void;
  seek(sec: number): void;
  setRate(r: number): void;
  setGain(v: number): void;
}

let player: TurntablePlayer | null = null;
let cache: DecodeCache | null = null;

/** Live player handle (used by the platter/needle rAF loop). */
export function turntablePlayer(): TurntablePlayer {
  if (player) return player;
  const e = getEngine();
  const bus = e.ctx.createGain();
  bus.connect(e.graph.master.input);
  player = new TurntablePlayer({ ctx: e.ctx, input: bus });
  return player;
}

function ensureCache(): DecodeCache {
  if (cache) return cache;
  cache = new DecodeCache(getEngine().ctx);
  return cache;
}

function vmOf(t: TurntablePlayer): Omit<TurntableVM, 'name' | 'file' | 'peaks'> {
  return { state: t.state, rate: t.rate, gain: t.gain ?? 0.9 };
}

export const useTurntable = create<TurntableStore>((set) => ({
  vm: { name: 'SL-1200', file: '', state: 'empty', rate: 1, gain: 0.9, peaks: null },

  async loadFromCell(cellId) {
    const cell = useGrid.getState().cells[cellId];
    const clip = cell?.clip;
    const file = clip?.file ?? '';
    const hashName = file.split('/').pop()?.split('.')[0] ?? '';
    let buf = hashName ? ensureCache().peek(hashName) : null;
    const handle = useGrid.getState().currentHandle();
    if (!buf && handle && file) {
      const bytes = await handle.readBinary(file);
      if (bytes) buf = await ensureCache().decode(bytes);
    }
    if (!buf) {
      toast.error('Turntable: clip not loaded');
      return;
    }
    const t = turntablePlayer();
    t.load(buf);
    set((s) => ({
      vm: { ...s.vm, ...vmOf(t), name: file.split('/').pop() ?? 'Cell', file, peaks: cell?.peaks ?? computePeaks(buf, 500) },
    }));
  },

  async loadFile(file) {
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
      const t = turntablePlayer();
      t.load(buf);
      set((s) => ({ vm: { ...s.vm, ...vmOf(t), name: file.name, file: rel, peaks: computePeaks(buf, 500) } }));
      toast.success(`${file.name} → turntable`);
    } catch (e) {
      toast.error(`Turntable load failed: ${(e as Error).message}`);
    }
  },

  spin() {
    const t = turntablePlayer();
    t.play();
    set((s) => ({ vm: { ...s.vm, ...vmOf(t) } }));
  },

  stop() {
    const t = turntablePlayer();
    t.stop();
    set((s) => ({ vm: { ...s.vm, ...vmOf(t) } }));
  },

  seek(sec) {
    const t = turntablePlayer();
    t.seek(sec);
    set((s) => ({ vm: { ...s.vm, ...vmOf(t) } }));
  },

  setRate(r) {
    const t = turntablePlayer();
    t.setRate(Math.min(TT_MAX_RATE, Math.max(TT_MIN_RATE, r)));
    set((s) => ({ vm: { ...s.vm, rate: t.rate } }));
  },

  setGain(v) {
    const t = turntablePlayer();
    t.setGain(v);
    set((s) => ({ vm: { ...s.vm, gain: v } }));
  },
}));