import { create } from 'zustand';
import { getEngine } from '../audio/engine';
import { renderDemoLoops } from '../audio/demoLoops';
import type { ClipPlayer, ClipState } from '../audio/clipPlayer';
import type { Quantize } from '../audio/transport';

export type CellId = string;
export const cellId = (trackId: string, scene: number): CellId => `${trackId}:${scene}`;

export interface TrackVM { id: string; name: string; color: string }
export interface CellVM { id: CellId; trackId: string; scene: number; state: ClipState }

interface GridStore {
  tracks: TrackVM[];
  sceneCount: number;
  cells: Record<CellId, CellVM>;
  players: Record<CellId, ClipPlayer>;
  quantize: Quantize;
  ready: boolean;
  setQuantize(q: Quantize): void;
  tap(id: CellId): void;
  init(): Promise<void>;
}

export const TRACKS: TrackVM[] = [
  { id: 'drums', name: 'Drums', color: '#14b8a6' },
  { id: 'bass',  name: 'Bass',  color: '#8b5cf6' },
  { id: 'synth', name: 'Synth', color: '#f59e0b' },
  { id: 'keys',  name: 'Keys',  color: '#ec4899' },
];

export const useGrid = create<GridStore>((set, get) => ({
  tracks: TRACKS,
  sceneCount: 4,
  cells: {},
  players: {},
  quantize: '1bar',
  ready: false,

  setQuantize: (q) => set({ quantize: q }),
  tap: (id) => { get().players[id]?.toggle(get().quantize); },

  init: async () => {
    const engine = getEngine();
    const cells: Record<CellId, CellVM> = {};
    const players: Record<CellId, ClipPlayer> = {};

    for (const tr of TRACKS) {
      for (let sc = 0; sc < get().sceneCount; sc++) {
        const id = cellId(tr.id, sc);
        const player = engine.playerFor(id, tr.id);
        player.onState((state) =>
          set((s) => ({ cells: { ...s.cells, [id]: { ...s.cells[id], state } } })));
        cells[id] = { id, trackId: tr.id, scene: sc, state: player.state };
        players[id] = player;
      }
    }
    set({ cells, players });

    const pack = await renderDemoLoops();
    for (const tr of TRACKS) {
      pack[tr.id].forEach((buf, sc) => players[cellId(tr.id, sc)].attach(buf));
    }
    set({ ready: true });
  },
}));
