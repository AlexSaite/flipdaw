import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import { createStepVoiceBus } from '../audio/stepVoice';
import type { StepVoiceBus } from '../sequencer/stepSequencer';
import { StepSequencer, mulberry32 } from '../sequencer/stepSequencer';
import { ChainRunner, type ChainStep } from '../sequencer/chain';
import {
  createPattern as modelCreatePattern,
  toggleStep,
  cycleVelocity,
  patchCell,
  setLength,
  randomizePattern,
  type SeqPattern,
} from '../sequencer/model';

/** Default kit: steps land on kick/snare/hat roll. */
export const SEQUENCER_KIT = ['kick', 'kick', 'snare', 'hat'];

const SEQ_TRACK = '__seq__';

let sequencer: StepSequencer | null = null;
let chainRunner: ChainRunner | null = null;

function freshId(): string {
  return `p${Math.random().toString(36).slice(2, 8)}`;
}

/** Clone a pattern so store actions stay immutable (model ops mutate in place). */
function clonePattern(p: SeqPattern): SeqPattern {
  return { ...p, steps: p.steps.map((c) => ({ ...c })) };
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
  toggleStep(i: number): void;
  cycleVelocity(i: number): void;
  patchCell(i: number, patch: Patch): void;
  setLength(n: number): void;
  setSwing(v: number): void;
  setHumanize(v: number): void;
  randomize(): void;
  setChain(steps: ChainStep[]): void;
  toggleChain(): void;
}

function houseBeat(p: SeqPattern): SeqPattern {
  for (const i of [0, 4, 8, 12]) { p.steps[i].on = true; p.steps[i].velocity = 1; }
  p.steps[4].velocity = 0.75;
  p.steps[12].velocity = 0.75;
  for (const i of [2, 6, 10, 14]) { p.steps[i].on = true; p.steps[i].velocity = 0.5; }
  p.steps[11].on = true;
  p.steps[11].velocity = 0.75;
  return p;
}

function initialHouse(): SeqPattern {
  const p = modelCreatePattern('pdefault', 'HouseBeat', 16);
  p.humanize = 0.3;
  return houseBeat(p);
}

export const useSequencer = create<SequencerStore>((set, get) => {
  const initial = initialHouse();

  function ensureSequencer(): void {
    if (sequencer) return;
    const e = getEngine();
    const voice: StepVoiceBus = createStepVoiceBus(e.ctx, e.stripFor(SEQ_TRACK).input);
    sequencer = new StepSequencer({
      transport: e.transport,
      scheduler: e.scheduler,
      now: () => e.ctx.currentTime,
      pattern: get().activePattern() ?? initial,
      getSourceIdAt: (i) => SEQUENCER_KIT[i % SEQUENCER_KIT.length] ?? 'kit',
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
      const p = modelCreatePattern(freshId(), name, 16);
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
    toggleStep: (i) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      toggleStep(n, i);
      commitActive(n);
    },
    cycleVelocity: (i) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      cycleVelocity(n, i);
      commitActive(n);
    },
    patchCell: (i, patch) => {
      const p = get().activePattern();
      if (!p) return;
      const n = clonePattern(p);
      patchCell(n, i, patch);
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