import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import {
  createDeckMixer, EQ_RANGE_DB,
  type DeckMixer, type EqBand,
} from '../audio/deckMixer';
import { Deck, type DeckState } from '../deck/deck';
import { DecodeCache } from '../project/decodeCache';
import { computePeaks, type Peaks } from '../project/thumbs';
import { useGrid } from './project';
import { toast } from './toasts';

export type DeckSide = 'A' | 'B';
export const DECK_DEFAULT_LOOP = 4;

const DEFAULT_EQ: Record<EqBand, number> = { low: 0, mid: 0, high: 0 };

interface DeckVM {
  name: string;
  file: string;
  state: DeckState;
  cueBeat: number | null;
  loopBeats: number | null;
  peaks: Peaks | null;
  eq: Record<EqBand, number>;
}

interface DeckStore {
  deckA: DeckVM;
  deckB: DeckVM;
  cross: number;
  setCross(v: number): void;
  setEq(side: DeckSide, band: EqBand, db: number): void;
  loadFromCell(side: DeckSide, cellId: string): Promise<void>;
  loadFile(side: DeckSide, file: File): Promise<void>;
  play(side: DeckSide): void;
  pause(side: DeckSide): void;
  sync(side: DeckSide): void;
  cue(side: DeckSide): void;
  jump(side: DeckSide): void;
  toggleLoop(side: DeckSide): void;
}

let mixer: DeckMixer | null = null;
let decks: Partial<Record<DeckSide, Deck>> = {};
let cache: DecodeCache | null = null;

function ensureMixer(): DeckMixer {
  if (mixer) return mixer;
  const e = getEngine();
  mixer = createDeckMixer(e.ctx, e.graph.master.input);
  return mixer;
}

function ensureDeck(side: DeckSide): Deck {
  const existing = decks[side];
  if (existing) return existing;
  const e = getEngine();
  const bus = side === 'A' ? ensureMixer().deckA : ensureMixer().deckB;
  const d = new Deck({ ctx: e.ctx, transport: e.transport, scheduler: e.scheduler, input: bus.input });
  decks[side] = d;
  return d;
}

function ensureCache(): DecodeCache {
  if (cache) return cache;
  cache = new DecodeCache(getEngine().ctx);
  return cache;
}

function vmKey(side: DeckSide): 'deckA' | 'deckB' {
  return side === 'A' ? 'deckA' : 'deckB';
}

function vmFromDeck(d: Deck): Omit<DeckVM, 'name' | 'file' | 'peaks' | 'eq'> {
  return { state: d.state, cueBeat: d.cueBeat, loopBeats: d.loopBeats };
}

/** Live deck player handle (used by the waveform marker loop). */
export function deckPlayer(side: DeckSide): Deck {
  return ensureDeck(side);
}

export const useDeck = create<DeckStore>((set) => ({
  deckA: { name: 'Deck A', file: '', state: 'empty', cueBeat: null, loopBeats: null, peaks: null, eq: { ...DEFAULT_EQ } },
  deckB: { name: 'Deck B', file: '', state: 'empty', cueBeat: null, loopBeats: null, peaks: null, eq: { ...DEFAULT_EQ } },
  cross: 0.5,

  setCross(v) {
    const c = Math.min(1, Math.max(0, v));
    ensureMixer().crossfade(c);
    set({ cross: c });
  },

  setEq(side, band, db) {
    const next = Math.min(EQ_RANGE_DB, Math.max(-EQ_RANGE_DB, db));
    const bus = side === 'A' ? ensureMixer().deckA : ensureMixer().deckB;
    bus.setEq(band, next);
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], eq: { ...s[key].eq, [band]: next } } }));
  },

  async loadFromCell(side, cellId) {
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
      toast.error('Deck: clip not loaded');
      return;
    }
    const d = ensureDeck(side);
    d.load(buf);
    const key = vmKey(side);
    set((s) => ({
      [key]: {
        ...s[key], ...vmFromDeck(d),
        name: file.split('/').pop() ?? 'Cell',
        file, peaks: cell?.peaks ?? computePeaks(buf, 500),
      },
    }));
  },

  async loadFile(side, file) {
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
      const d = ensureDeck(side);
      d.load(buf);
      const key = vmKey(side);
      set((s) => ({
        [key]: {
          ...s[key], ...vmFromDeck(d),
          name: file.name, file: rel, peaks: computePeaks(buf, 500),
        },
      }));
      toast.success(`${file.name} → Deck ${side}`);
    } catch (e) {
      toast.error(`Deck load failed: ${(e as Error).message}`);
    }
  },

  play(side) {
    const d = ensureDeck(side);
    d.play('1bar');
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], ...vmFromDeck(d) } }));
  },

  pause(side) {
    const d = ensureDeck(side);
    d.pause('1bar');
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], ...vmFromDeck(d) } }));
  },

  sync(side) {
    const d = ensureDeck(side);
    d.sync();
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], ...vmFromDeck(d) } }));
  },

  cue(side) {
    const d = ensureDeck(side);
    const now = getEngine().ctx.currentTime;
    const beat = getEngine().transport.playing
      ? getEngine().transport.nowBeats()
      : d.positionBeat(now);
    d.cueAt(Math.max(0, Math.floor(beat)));
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], ...vmFromDeck(d) } }));
  },

  jump(side) {
    const d = ensureDeck(side);
    d.jumpCue();
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], ...vmFromDeck(d) } }));
  },

  toggleLoop(side) {
    const d = ensureDeck(side);
    d.setLoop(d.loopBeats === null ? DECK_DEFAULT_LOOP : null);
    const key = vmKey(side);
    set((s) => ({ [key]: { ...s[key], ...vmFromDeck(d) } }));
  },
}));