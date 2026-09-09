import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import { renderDemoLoops } from '../audio/demoLoops';
import type { ClipPlayer, ClipState } from '../audio/clipPlayer';
import type { Quantize } from '../audio/transport';
import type { TrackStrip } from '../audio/graph';
import { DecodeCache } from '../project/decodeCache';
import { computePeaks, peaksToJson, type Peaks } from '../project/thumbs';
import { serializeProject, parseProject } from '../project/io';
import {
  validateProject, SCHEMA_VERSION,
  type ClipSchema, type ProjectSchema, type TrackSchema,
} from '../project/schema';
import type { DirHandle, FsAdapter } from '../project/fsAdapter';
import { toast } from './toasts';

export type CellId = string;
export const cellId = (trackId: string, scene: number): CellId => `${trackId}:${scene}`;

export interface TrackVM {
  id: string;
  name: string;
  color: string;
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface CellVM {
  id: CellId;
  trackId: string;
  scene: number;
  state: ClipState;
  clip?: ClipSchema;
  peaks?: Peaks;
}

export type EditorStatus = 'closed' | 'dirty' | 'clean';

interface GridStore {
  tracks: TrackVM[];
  sceneCount: number;
  cells: Record<CellId, CellVM>;
  players: Record<CellId, ClipPlayer>;
  quantize: Quantize;
  ready: boolean;
  setQuantize(q: Quantize): void;
  tap(id: CellId): void;

  selected: CellId | null;
  select(id: CellId | null): void;

  editorStatus: EditorStatus;
  projectName: string;
  open(handle: DirHandle, buffer: string): Promise<boolean>;
  save(adapter: FsAdapter): Promise<void>;
  saveAs(adapter: FsAdapter): Promise<void>;
  setDirty(): void;
  clearDirty(): void;

  setTrackGain(trackId: string, v: number): void;
  setTrackPan(trackId: string, v: number): void;
  setTrackMute(trackId: string, m: boolean): void;
  setTrackSolo(trackId: string, s: boolean): void;
  meter(trackId: string): number;

  importFile(file: File): Promise<void>;

  init(): Promise<void>;
  resetToDemo(): Promise<void>;
}

const DEMO_COLORS: Record<string, string> = {
  drums: '#14b8a6',
  bass: '#8b5cf6',
  synth: '#f59e0b',
  keys: '#ec4899',
};

function isSoloActive(tracks: TrackVM[]): boolean {
  return tracks.some((t) => t.solo);
}

function effectiveMute(tm: TrackVM, tracks: TrackVM[]): boolean {
  const solo = isSoloActive(tracks);
  return tm.muted || (solo && !tm.solo);
}

function toPlayerRecord(pm: Map<string, ClipPlayer>): Record<CellId, ClipPlayer> {
  const rec: Record<CellId, ClipPlayer> = {};
  pm.forEach((p, k) => { rec[k] = p; });
  return rec;
}

function buildProjectFromState(): ProjectSchema {
  const g = useGrid.getState();
  const tracks: TrackSchema[] = g.tracks.map((t) => {
    const clips = Object.values(g.cells)
      .filter((c) => c.trackId === t.id && c.clip)
      .sort((a, b) => a.scene - b.scene)
      .map((c) => c.clip as ClipSchema);
    return { id: t.id, name: t.name, color: t.color, gain: t.gain, pan: t.pan, muted: t.muted, solo: t.solo, clips };
  });
  return {
    meta: {
      name: g.projectName,
      version: SCHEMA_VERSION,
      bpm: 120,
      timeSig: [4, 4],
      updatedAt: new Date().toISOString(),
    },
    sceneCount: g.sceneCount,
    tracks,
  };
}

export const useGrid = create<GridStore>((set, get) => {
  let activeHandle: DirHandle | null = null;
  let cache: DecodeCache | null = null;
  let strips = new Map<string, TrackStrip>();
  let players = new Map<string, ClipPlayer>();

  function ensureStrips(): void {
    for (const t of get().tracks) {
      if (!strips.has(t.id)) strips.set(t.id, getEngine().stripFor(t.id));
    }
  }

  function applyMixToStrip(trackId: string): void {
    const t = get().tracks.find((x) => x.id === trackId);
    const strip = strips.get(trackId);
    if (!t || !strip) return;
    strip.setGain(t.gain);
    strip.setPan(t.pan);
    strip.setMute(effectiveMute(t, get().tracks));
  }

  function rebuildCells(): void {
    ensureStrips();
    const cells: Record<CellId, CellVM> = {};
    const pm = new Map<string, ClipPlayer>();
    const sceneCount = get().sceneCount;
    const e = getEngine();
    const existing = useGrid.getState().cells;
    for (const t of get().tracks) {
      for (let sc = 0; sc < sceneCount; sc++) {
        const id = cellId(t.id, sc);
        const prev = existing[id];
        const clip = prev?.clip;
        const peaks = prev?.peaks;
        const player = e.playerFor(id, t.id);
        player.onState((state) =>
          set((s) => ({ cells: { ...s.cells, [id]: { ...s.cells[id], state } } })));
        cells[id] = { id, trackId: t.id, scene: sc, state: player.state, clip, peaks };
        pm.set(id, player);
      }
    }
    players = pm;
    set({ cells, players: toPlayerRecord(pm), ready: true });
  }

  return {
    tracks: [],
    sceneCount: 4,
    cells: {},
    players: {},
    quantize: '1bar',
    ready: false,

    setQuantize: (q) => set({ quantize: q }),
    tap: (id) => { players.get(id)?.toggle(get().quantize); },

    selected: null,
    select: (id) => set({ selected: id }),

    editorStatus: 'closed',
    projectName: 'Untitled',
    setDirty: () => { if (get().editorStatus !== 'dirty') set({ editorStatus: 'dirty' }); },
    clearDirty: () => { if (get().editorStatus === 'dirty') set({ editorStatus: 'clean' }); },

    async open(handle, buffer) {
      const res = parseProject(buffer);
      if ('error' in res) { toast.error(`Open failed: ${res.error}`); return false; }
      const p = res.project;
      const v = validateProject(p);
      if (!v.ok) { toast.error(`Invalid project: ${v.errors.join('; ')}`); return false; }
      activeHandle = handle;
      strips = new Map();
      players = new Map();
      const tracks: TrackVM[] = p.tracks.map((t) => ({
        id: t.id, name: t.name, color: t.color,
        gain: t.gain, pan: t.pan, muted: t.muted, solo: t.solo,
      }));
      set({ tracks, sceneCount: p.sceneCount, cells: {}, players: {}, selected: null, projectName: p.meta.name });
      // hydrate clips into cells so UI can show thumbnails and attach later
      const cells: Record<CellId, CellVM> = {};
      const pm = new Map<string, ClipPlayer>();
      const e = getEngine();
      ensureStrips();
      for (const t of p.tracks) {
        for (let sc = 0; sc < p.sceneCount; sc++) {
          const id = cellId(t.id, sc);
          const clip = t.clips.find((c) => c.scene === sc);
          const player = e.playerFor(id, t.id);
          player.onState((state) =>
            set((s) => ({ cells: { ...s.cells, [id]: { ...s.cells[id], state } } })));
          cells[id] = { id, trackId: t.id, scene: sc, state: player.state, clip };
          pm.set(id, player);
        }
      }
      players = pm;
      set({ cells, players: toPlayerRecord(pm), editorStatus: 'clean' });
      toast.success(`Opened ${p.meta.name}`);
      return true;
    },

    async save(adapter) {
      if (!activeHandle) { await get().saveAs(adapter); return; }
      const p = buildProjectFromState();
      await activeHandle.writeText('project.json', serializeProject(p));
      get().clearDirty();
      toast.success(`Saved ${p.meta.name}`);
    },

    async saveAs(adapter) {
      const h = await adapter.pickDirectory();
      if (!h) return;
      const p = buildProjectFromState();
      await h.writeText('project.json', serializeProject(p));
      activeHandle = h;
      await adapter.saveRecent({ name: h.name, handle: h });
      set({ projectName: p.meta.name });
      get().clearDirty();
      toast.success(`Saved as ${h.name}`);
    },

    setTrackGain(id, v) {
      set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, gain: v } : t) }));
      applyMixToStrip(id); get().setDirty();
    },
    setTrackPan(id, v) {
      set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, pan: v } : t) }));
      applyMixToStrip(id); get().setDirty();
    },
    setTrackMute(id, m) {
      set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, muted: m } : t) }));
      applyMixToStrip(id); get().setDirty();
    },
    setTrackSolo(id, s) {
      const tracks = get().tracks.map((t) => t.id === id ? { ...t, solo: s } : t);
      set((state) => ({ ...state, tracks }));
      tracks.forEach((t) => applyMixToStrip(t.id));
      get().setDirty();
    },
    meter(id) { return strips.get(id)?.meter() ?? 0; },

    async importFile(file) {
      try {
        const target = get().selected ?? cellId(get().tracks[0]?.id ?? '', 0);
        const [trackId, sceneStr] = target.split(':');
        const scene = Number(sceneStr);
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!cache) cache = new DecodeCache(getEngine().ctx);
        const buf = await cache.decode(bytes);
        if (!buf) throw new Error('unsupported or corrupt audio');
        const hash = await cache.hashOf(bytes);
        const isWav = /\.wav$/i.test(file.name);
        const ext = isWav ? 'wav' : 'aud';
        const rel = `samples/${hash}.${ext}`;
        const type: ClipSchema['type'] = isWav ? 'loop' : 'oneshot';
        const seconds = buf.duration;
        const lengthBeats = (type === 'loop')
          ? Math.max(4, Math.round((seconds * getEngine().transport.bpm) / 60 / 4) * 4)
          : Math.max(1, Math.round((seconds * getEngine().transport.bpm) / 60));
        const clip: ClipSchema = { id: target, file: rel, type, lengthBeats, gain: 1, scene };
        const player = players.get(target);
        if (player) player.attach(buf);
        const peaks = computePeaks(buf, 600);
        set((s) => ({
          cells: { ...s.cells, [target]: { ...s.cells[target], clip, peaks } },
        }));
        if (activeHandle) {
          await activeHandle.writeBinary(rel, bytes);
          const hashName = `${hash}.json`;
          await activeHandle.writeText(`thumbs/${hashName}`, peaksToJson(peaks));
        } else if (get().editorStatus !== 'closed') {
          get().setDirty();
        }
        get().setDirty();
        toast.success(`Imported ${file.name} → ${trackId} / scene ${scene + 1}`);
      } catch (e) {
        toast.error(`Import failed: ${(e as Error).message}`);
      }
    },

    async init() {
      if (get().ready) return;
      await get().resetToDemo();
    },

    async resetToDemo() {
      strips = new Map();
      players = new Map();
      const tracks: TrackVM[] = Object.entries(DEMO_COLORS).map(([id, color]) => ({
        id, name: id[0].toUpperCase() + id.slice(1), color,
        gain: 0.9, pan: 0, muted: false, solo: false,
      }));
      set({ tracks, sceneCount: 4, cells: {}, players: {}, ready: false, selected: null, projectName: 'Demo', editorStatus: 'closed' });
      rebuildCells();
      const pack = await renderDemoLoops();
      for (const [tr, list] of Object.entries(pack)) {
        list.forEach((buf, sc) => players.get(cellId(tr, sc))?.attach(buf));
      }
      set({ ready: true });
    },
  };
});
