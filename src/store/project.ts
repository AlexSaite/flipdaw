import { create } from 'zustand';
import { getEngine, type FollowHooks } from '../audio/engine';
import { renderDemoLoops } from '../audio/demoLoops';
import type { ClipPlayer, ClipState } from '../audio/clipPlayer';
import type { Quantize, Seconds } from '../audio/transport';
import type { TrackStrip } from '../audio/graph';
import { DecodeCache } from '../project/decodeCache';
import { computePeaks, peaksToJson, type Peaks } from '../project/thumbs';
import { serializeProject, parseProject } from '../project/io';
import { rotateAndSave } from '../project/autosave';
import {
  validateProject, SCHEMA_VERSION,
  type ClipSchema, type ProjectSchema, type TrackSchema,
} from '../project/schema';
import type { DirHandle, FsAdapter } from '../project/fsAdapter';
import { toast } from './toasts';
import { useHistory } from './history';
import type { RecordState } from '../audio/recorder';
import type { FollowAction, FollowEvent } from '../audio/follow';

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

/** Metadata snapshot for undo/redo (ADR-006: never audio buffers). */
export interface ProjectSnapshot {
  tracks: TrackVM[];
  sceneCount: number;
  cellsSnap: Record<CellId, { clip?: ClipSchema; peaks?: Peaks }>;
  selected: CellId | null;
  projectName: string;
}

function takeSnapshot(): ProjectSnapshot {
  const g = useGrid.getState();
  const cellsSnap: ProjectSnapshot['cellsSnap'] = {};
  for (const [id, c] of Object.entries(g.cells)) {
    if (c.clip || c.peaks) cellsSnap[id] = { clip: c.clip, peaks: c.peaks };
  }
  return {
    tracks: JSON.parse(JSON.stringify(g.tracks)) as TrackVM[],
    sceneCount: g.sceneCount,
    cellsSnap,
    selected: g.selected,
    projectName: g.projectName,
  };
}

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
  autosave(): Promise<void>;
  setDirty(): void;
  clearDirty(): void;

  setTrackGain(trackId: string, v: number): void;
  setTrackPan(trackId: string, v: number): void;
  setTrackMute(trackId: string, m: boolean): void;
  setTrackSolo(trackId: string, s: boolean): void;
  meter(trackId: string): number;

  importFile(file: File): Promise<void>;

  // M3: recording + follow-actions + reverb send
  recordState: RecordState;
  follows: Partial<Record<number, FollowAction>>;
  reverbLevel: number;
  startRecording(): Promise<boolean>;
  stopRecording(): void;
  cancelRecording(): void;
  setFollowAction(scene: number, action: FollowAction | null): void;
  setReverbLevel(v: number): void;

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
      .filter((c) => c.trackId === t.id && c.clip && c.clip.file) // skip session-only recordings
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

  /** Restore editable metadata from an undo/redo snapshot. */
  function applySnapshot(snap: ProjectSnapshot): void {
    const sceneCount = snap.sceneCount;
    const e = getEngine();
    set({ tracks: snap.tracks, sceneCount, selected: snap.selected, projectName: snap.projectName, cells: {}, players: {}, ready: true });
    ensureStrips();
    const cells: Record<CellId, CellVM> = {};
    const pm = new Map<string, ClipPlayer>();
    for (const t of snap.tracks) {
      for (let sc = 0; sc < sceneCount; sc++) {
        const id = cellId(t.id, sc);
        const snapC = snap.cellsSnap[id];
        const clip = snapC?.clip;
        const peaks = snapC?.peaks;
        const player = e.playerFor(id, t.id);
        player.onState((state) =>
          set((s) => ({ cells: { ...s.cells, [id]: { ...s.cells[id], state } } })));
        if (clip) {
          const hashName = clip.file.split('/').pop()?.split('.')[0] ?? '';
          const buf = cache?.peek(hashName);
          if (buf) { player.attach(buf); player.setGain(clip.gain); }
        } else {
          player.detach();
        }
        cells[id] = { id, trackId: t.id, scene: sc, state: player.state, clip, peaks };
        pm.set(id, player);
      }
    }
    players = pm;
    set({ cells, players: toPlayerRecord(pm), ready: true });
  }

  /** Push a history entry and mark the doc dirty. */
  function commit(): void {
    useHistory.getState().push(takeSnapshot());
    get().setDirty();
  }

  function resetHistoryBaseline(): void {
    const h = useHistory.getState();
    h.clear();
    h.setApplier((e) => applySnapshot(e as ProjectSnapshot));
    h.push(takeSnapshot());
  }

  // ── M3: follow-actions + recording ──────────────────────────────────────

  const followHooks: FollowHooks = {
    onFollow: (ev: FollowEvent) => {
      const scene = Number(ev.scene);
      if (ev.type === 'next' || ev.type === 'afterBars') {
        launchScene(scene + 1);
      } else if (ev.type === 'stop') {
        panicPlayers();
        toast.info(`Follow: ${ev.type} after ${ev.scene}`);
      }
    },
  };

  function ensureFollow(): void {
    getEngine().getFollow(followHooks);
  }

  function panicPlayers(): void {
    players.forEach((p) => p.panic());
  }

  /** Start every track's clip at `targetScene` that is armed and idle. */
  function launchScene(targetScene: number): void {
    if (targetScene >= get().sceneCount) { panicPlayers(); return; }
    ensureFollow();
    for (const t of get().tracks) {
      const id = cellId(t.id, targetScene);
      const cell = get().cells[id];
      const p = players.get(id);
      if (!cell?.clip || !p || p.state === 'empty' || p.state === 'queued') continue;
      const res = p.toggle(get().quantize);
      if (res.action === 'start' && res.atSec !== null) {
        getEngine().getFollow().sceneStarted(String(targetScene), res.atSec);
      }
    }
  }

  function onRecordedBuffer(buf: AudioBuffer, startSec: Seconds, endSec: Seconds): void {
    const target = get().selected ?? cellId(get().tracks[0]?.id ?? '', 0);
    const [trackId, scene] = target.split(':');
    const lengthBeats = Math.max(1, Math.round(((endSec - startSec) * getEngine().transport.bpm) / 60));
    const clip: ClipSchema = { id: target, file: '', type: 'loop', lengthBeats, gain: 1, scene: Number(scene) };
    const player = players.get(target);
    if (player) { player.attach(buf); player.setGain(clip.gain); }
    const peaks = computePeaks(buf, 600);
    set((s) => ({ cells: { ...s.cells, [target]: { ...s.cells[target], clip, peaks } } }));
    commit();
    toast.success(`Recorded ${lengthBeats} beats → ${trackId} / scene ${Number(scene) + 1}`);
  }

  return {
    tracks: [],
    sceneCount: 4,
    cells: {},
    players: {},
    quantize: '1bar',
    ready: false,
    follows: {},
    reverbLevel: 0.15,
    recordState: 'idle',

    setQuantize: (q) => set({ quantize: q }),
    tap: (id) => {
      const res = players.get(id)?.toggle(get().quantize);
      if (res?.action === 'start' && res.atSec !== null) {
        ensureFollow();
        const scene = get().cells[id]?.scene ?? 0;
        getEngine().getFollow().sceneStarted(String(scene), res.atSec);
      }
    },

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
      resetHistoryBaseline();
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

    async autosave() {
      if (!activeHandle) return;
      const p = buildProjectFromState();
      await rotateAndSave(activeHandle, serializeProject(p));
      if (get().editorStatus === 'dirty') get().clearDirty();
    },

    setTrackGain(id, v) {
      set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, gain: v } : t) }));
      applyMixToStrip(id);
      commit();
    },
    setTrackPan(id, v) {
      set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, pan: v } : t) }));
      applyMixToStrip(id);
      commit();
    },
    setTrackMute(id, m) {
      set((s) => ({ tracks: s.tracks.map((t) => t.id === id ? { ...t, muted: m } : t) }));
      applyMixToStrip(id);
      commit();
    },
    setTrackSolo(id, s) {
      const tracks = get().tracks.map((t) => t.id === id ? { ...t, solo: s } : t);
      set((state) => ({ ...state, tracks }));
      tracks.forEach((t) => applyMixToStrip(t.id));
      commit();
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
        commit();
        toast.success(`Imported ${file.name} → ${trackId} / scene ${scene + 1}`);
      } catch (e) {
        toast.error(`Import failed: ${(e as Error).message}`);
      }
    },

    async startRecording() {
      if (get().recordState !== 'idle') return false;
      const e = getEngine();
      if (!e.transport.playing) e.transport.start();
      const rec = await e.getRecorder({
        onState: (s) => set({ recordState: s }),
        onBuffer: onRecordedBuffer,
      });
      const startAt = rec.arm();
      if (startAt === null) return false;
      e.metronome.setEnabled(true);   // count-in clicks
      toast.info(`Recording from ${get().projectName === 'Demo' ? 'now' : 'boundary'}`);
      return true;
    },

    stopRecording() {
      void getEngine().getRecorder().then((rec) => { rec.requestStop(); });
    },

    cancelRecording() {
      void getEngine().getRecorder().then((rec) => { rec.cancel(); });
    },

    setFollowAction(scene, action) {
      set((s) => {
        const follows = { ...s.follows } as Partial<Record<number, FollowAction>>;
        if (action === null) delete follows[scene];
        else follows[scene] = action;
        return { follows };
      });
      ensureFollow();
      const runner = getEngine().getFollow();
      if (action === null) runner.removeAction(String(scene));
      else runner.setAction(String(scene), action);
    },

    setReverbLevel(v) {
      const level = Math.min(1, Math.max(0, v));
      set({ reverbLevel: level });
      getEngine().getReverb().setLevel(level);
    },

    async init() {
      if (get().ready) return;
      await get().resetToDemo();
    },

    async resetToDemo() {
      strips = new Map();
      players = new Map();
      activeHandle = null;
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
      resetHistoryBaseline();
    },
  };
});
