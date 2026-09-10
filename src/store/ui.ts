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
  /** Module tiles open in the studio stage, left→right. 0 = wall only. */
  open: DeckKey[];
  /** Last-tapped tile (highlighted/active). */
  focused: DeckKey | null;
  /** Secondary-control panel open over the workspace ('mixer' | 'master' | null). */
  overlay: OverlayKey;
  setMode(mode: LayoutMode): void;
  setMidiSync(on: boolean): void;
  setHinge(angle: number): void;
  setSettingsOpen(open: boolean): void;
  setMappingOpen(open: boolean): void;
  /** Wall tap: open a closed module and focus it; focusing keeps it open. */
  toggleOpen(key: DeckKey): void;
  focus(key: DeckKey): void;
  /** Expand one tile to fill the whole stage (window-style "maximize"). */
  solo(key: DeckKey): void;
  closeTile(key: DeckKey): void;
  setOverlay(overlay: OverlayKey): void;
}

export const useUi = create<UiStore>((set) => ({
  mode: 'studio',
  settingsOpen: false,
  mappingOpen: false,
  midiSync: false,
  hinge: null,
  open: [],
  focused: null,
  overlay: null,
  setMode: (mode) => set({ mode }),
  setMidiSync: (midiSync) => set({ midiSync }),
  setHinge: (hinge) => set({ hinge }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMappingOpen: (mappingOpen) => set({ mappingOpen }),
  toggleOpen: (key) => set((s) => {
    if (!s.open.includes(key)) return { open: [...s.open, key], focused: key };
    return { focused: key };
  }),
  focus: (key) => set({ focused: key }),
  solo: (key) => set({ open: [key], focused: key }),
  closeTile: (key) => set((s) => {
    const open = s.open.filter((k) => k !== key);
    return {
      open,
      focused: s.focused === key ? (open.length > 0 ? open[open.length - 1] : null) : s.focused,
    };
  }),
  setOverlay: (overlay) => set({ overlay }),
}));