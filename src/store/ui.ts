import { create } from 'zustand';

export type LayoutMode = 'studio' | 'laptop' | 'tent' | 'mixer';

/** Instrument decks of the Studio workspace (UI-REDESIGN §3). */
export type DeckKey = 'grid' | 'drum' | 'piano' | 'sampler' | 'dj' | 'tt';

/** Secondary-control panels rendered as translucent overlays (UI-REDESIGN §4). */
export type OverlayKey = 'mixer' | 'master' | null;

interface UiStore {
  mode: LayoutMode;
  settingsOpen: boolean;
  mappingOpen: boolean;
  midiSync: boolean;
  /** Last hinge angle reported by the sensor (or simulated), degrees. */
  hinge: number | null;
  /** Which instrument deck is expanded in the Studio workspace. */
  activeDeck: DeckKey;
  /** Secondary-control panel open over the workspace ('mixer' | 'master' | null). */
  overlay: OverlayKey;
  setMode(mode: LayoutMode): void;
  setMidiSync(on: boolean): void;
  setHinge(angle: number): void;
  setSettingsOpen(open: boolean): void;
  setMappingOpen(open: boolean): void;
  setActiveDeck(deck: DeckKey): void;
  setOverlay(overlay: OverlayKey): void;
}

export const useUi = create<UiStore>((set) => ({
  mode: 'studio',
  settingsOpen: false,
  mappingOpen: false,
  midiSync: false,
  hinge: null,
  activeDeck: 'grid',
  overlay: null,
  setMode: (mode) => set({ mode }),
  setMidiSync: (midiSync) => set({ midiSync }),
  setHinge: (hinge) => set({ hinge }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMappingOpen: (mappingOpen) => set({ mappingOpen }),
  setActiveDeck: (activeDeck) => set({ activeDeck }),
  setOverlay: (overlay) => set({ overlay }),
}));