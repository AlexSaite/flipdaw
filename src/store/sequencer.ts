import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import { createStepVoiceBus } from '../audio/stepVoice';
import type { StepVoiceBus } from '../sequencer/stepSequencer';
import { StepSequencer, mulberry32 } from '../sequencer/stepSequencer';
import { ChainRunner, type ChainStep } from '../sequencer/chain';
import { KIT_PRESETS, kitVoiceAt } from '../sequencer/kits';
import {
  createPattern as modelCreatePattern,
  toggleStep,
  cycleVelocity,
  patchCell,
  setLength,
  randomizePattern,
  MAX_ROWS,
  type SeqPattern,
} from '../sequencer/model';
import { DecodeCache } from '../project/decodeCache';
import { useGrid } from './project';
import { toast } from './toasts';

/** Default kit: one preset per row, 16 voices (M6.4). */
export const SEQUENCER_KIT = KIT_PRESETS.map((v) => v.voice);

const SEQ_TRACK = '__seq__';
/** Voice id used for a sample-backed row. */
export function sampleVoiceId(hash: string): string {
  return `smp:${hash}`;
}

let sequencer: StepSequencer | null = null;
let chainRunner: ChainRunner | null = null;
let voice: StepVoiceBus | null = null;
let cache: DecodeCache | null = null;

function ensureCache(): DecodeCache {
  if (cache) return cache;
  cache = new DecodeCache(getEngine().ctx);
  return cache;
}

function freshId(): string {
  return `p${Math.random().toString(36).slice(2, 8)}`;
}

/** Clone a pattern so store actions stay immutable (model ops mutate in place). */
function clonePattern(p: SeqPattern): SeqPattern {
  return {
    ...p,
    rows: p.rows.map((row) => ({ ...row, steps: row.steps.map((c) => ({ ...c })) })),
  };
}

export interface Patch {
  flam?: number;
  ratchet?: number;
  probability?: number;
}

export interface SequencerStore {
  patterns: SeqPattern[];
  activeId: string;
  armed: boolean;
  chain: ChainStep[];
  chainOn: boolean;
  activePattern(): SeqPattern | null;
  findPattern(id: string): SeqPattern | null;
  setActive(id: string): void;
  createPattern(name?: string): SeqPattern;
  removePattern(id: string): void;
  toggleArmed(): void;
  toggleStep(r: number, i: number): void;
  cycleVelocity(r: number, i: number): void;
  patchCell(r: number, i: number, patch: Patch): void;
  setLength(n: number): void;
  setSwing(v: number): void;
  setHumanize(v: number): void;
  randomize(): void;
  /** Load a WAV into row r as a sample-backed voice. */
  importSample(r: number, file: File): Promise<void>;
  /** Revert a sample row back to its default synth voice. */
  resetRow(r: number): void;
  setChain(steps: ChainStep[]): void;
  toggleChain(): void;
}

function houseBeat(p: SeqPattern): SeqPattern {
  const kick = p.rows[0].steps;
  for (const i of [0, 4, 8, 12]) kick[i].on = true;
  kick[0].velocity = 1; kick[4].velocity = 0.75; kick[8].velocity = 1; kick[12].velocity = 0.75;
  const snare = p.rows[1].steps;
  snare[4].on = true; snare[4].velocity = 1;
  snare[12].on = true; snare[12].velocity = 1;
  const hat = p.rows[2].steps;
  for (const i of [2, 6, 10, 14]) hat[i].on = true;
  for (const i of [2, 6, 10, 14]) hat[i].velocity = 0.5;
  const oh = p.rows[3].steps;
  oh[11].on = true; oh[11].velocity = 0.75;
  return p;
}

function initialHouse(): SeqPattern {
  const p = modelCreatePattern('pdefault', 'HouseBeat', 16, MAX_ROWS);
  p.humanize = 0.3;
  return houseBeat(p);
}

export const useSequencer = create<SequencerStore>((set, get) => {
  const initial = initialHouse();

  function ensureSequencer(): void {
    if (sequencer) return;
    const e = getEngine();
    voice = createStepVoiceBus(e.ctx, e.stripFor(SEQ_TRACK).input);
    sequencer = new StepSequencer({
      transport: e.transport,
      scheduler: e.scheduler,
      now: () => e.ctx.currentTime,
      pattern: get().activePattern() ?? initial,
      voice,
      rng: mulberry32((Math.random() * 2 ** 32) >>> 0),
    });
    chainRunner = new ChainRunner({
      transport: e.transport,
      scheduler: e.scheduler,
      onPatternChanged: (id) => {
        const p = get().findPattern(id);
        if (!p) return; // stale chain entry — keep current pattern
        set({ activeId: id });
        sequencer?.setPattern(p);
      },
    });
    e.transport.subscribe((s) => {
      if (s.playing) chainStart();
      else sequencer?.clearScheduled();
    });
  }

  function chainStart(): void {
    const st = get();
    if (!st.chainOn || st.chain.length === 0) return;
    chainRunner?.setChain(st.chain);
    chainRunner?.start(getEngine().transport.nowBeats());
  }

  function commitActive(p: SeqPattern): void {
    sequencer?.setPattern(p);
    set((s) => ({ patterns: s.patterns.map((x) => (x.id === s.activeId ? p : x)) }));
  }

  return {
    patterns: [initial],
    activeId: initial.id,
    armed: false,
    chain: [],
    chainOn: false,
    activePattern: () => {
      const st = get();
      return st.patterns.find((p) => p.id === st.activeId) ?? null;
    },
    findPattern: (id) => get().patterns.find((p) => p.id === id) ?? null,
    setActive: (id) => {
      const p = get().findPattern(id);
      if (!p) return;
      sequencer?.setPattern(p);
      set({ activeId: id });
    },
    createPattern: (name = 'Pattern') => {
      ensureSequencer();
      const p = modelCreatePattern(freshId(), name, 16, MAX_ROWS);
      set((s) => ({ patterns: [...s.patterns, p], activeId: p.id }));
      sequencer?.setPattern(p);
      return p;
    },
    removePattern: (id) => {
      const s = get();
      if (s.patterns.length <= 1) return;
      const next = s.patterns.filter((p) => p.id !== id);
      const chain = s.chain.filter((c) => c.patternId !== id); // drop stale chain hops
      let activeId = id === s.activeId ? next[0].id : s.activeId;
      if (chain.length === 0) set({ patterns: next, activeId, chain, chainOn: false });
      else set({ patterns: next, activeId, chain });
      activeId = get().activeId;
      const p = next.find((x) => x.id === activeId);
      if (p) sequencer?.setPattern(p);
    },
    toggleArmed: () => {
      ensureSequencer();
      const next = !get().armed;
      sequencer?.setArmed(next);
      if (next) chainStart();
      set({ armed: next });
    },
    toggleStep: (r, i) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      toggleStep(n, r, i);
      commitActive(n);
    },
    cycleVelocity: (r, i) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      cycleVelocity(n, r, i);
      commitActive(n);
    },
    patchCell: (r, i, patch) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      patchCell(n, r, i, patch);
      commitActive(n);
    },
    setLength: (n) => {
      const p = get().activePattern();
      if (!p) return;
      const c = clonePattern(p);
      setLength(c, n);
      commitActive(c);
    },
    setSwing: (v) => {
      const p = get().activePattern();
      if (!p) return;
      commitActive({ ...clonePattern(p), swing: v });
    },
    setHumanize: (v) => {
      const p = get().activePattern();
      if (!p) return;
      commitActive({ ...clonePattern(p), humanize: v });
    },
    randomize: () => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      randomizePattern(n, mulberry32((Math.random() * 2 ** 32) >>> 0));
      commitActive(n);
    },
    importSample: async (r, file) => {
      try {
        ensureSequencer();
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
        const id = sampleVoiceId(hash);
        voice?.setSample(id, buf);
        const p = get().activePattern();
        if (p) {
          const n = clonePattern(p);
          n.rows[r] = { ...n.rows[r], voice: id, kind: 'sample', sampleSha: hash };
          commitActive(n);
        }
        toast.success(`${file.name} → row ${r + 1}`);
      } catch (e) {
        toast.error(`Load failed: ${(e as Error).message}`);
      }
    },
    resetRow: (r) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      n.rows[r] = { ...n.rows[r], voice: kitVoiceAt(r), kind: 'synth', sampleSha: null };
      commitActive(n);
    },
    setChain: (steps) => {
      set({ chain: steps });
      if (get().chainOn) chainStart();
    },
    toggleChain: () => {
      ensureSequencer();
      const next = !get().chainOn;
      set({ chainOn: next });
      if (next) chainStart();
    },
  };
});