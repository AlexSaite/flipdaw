import { create } from 'zustand';

export type LayoutMode = 'studio' | 'laptop' | 'tent' | 'mixer';

/** Instrument decks of the Studio workspace (UI-REDESIGN §3). */
export type DeckKey = 'grid' | 'drum' | 'piano' | 'sampler' | 'dj' | 'tt';

/** Secondary-control panels rendered as translucent overlays (UI-REDESIGN §4). */
export type OverlayKey = 'mixer' | null;

/** Studio canvas phases: the pads grid → previewPro → fullscreen module. */
export type StudioView = 'pads' | 'preview' | 'full';

interface UiStore {
  mode: LayoutMode;
  settingsOpen: boolean;
  mappingOpen: boolean;
  midiSync: boolean;
  /** Last hinge angle reported by the sensor (or simulated), degrees. */
  hinge: number | null;
  /** Secondary-control panel open over the workspace ('mixer' | null). */
  overlay: OverlayKey;
  /** Current phase of the studio canvas. */
  view: StudioView;
  /** previewPro: 1..2 modules, both live and interactive, split left→right. */
  preview: DeckKey[];
  /** Fullscreen module while view === 'full' (preview set is kept to restore). */
  fulldeck: DeckKey | null;
  /** Right-hand "+ add second module" picker visible (single-module previewPro only). */
  picking: boolean;

  setMode(mode: LayoutMode): void;
  setMidiSync(on: boolean): void;
  setHinge(angle: number): void;
  setSettingsOpen(open: boolean): void;
  setMappingOpen(open: boolean): void;
  setOverlay(overlay: OverlayKey): void;

  /** Pad tap: transform to previewPro with one chosen module. */
  openPreview(key: DeckKey): void;
  /** Toggle the big "+ add second module" picker (valid with exactly 1 pane). */
  togglePicker(): void;
  /** Pick a second module → two interactive previewPro panes. */
  addModule(key: DeckKey): void;
  /** Close previewPro of the chosen module → back to the pads grid. */
  closePreview(): void;
  /** Expand a previewPro pane into fullscreen functionality. */
  expand(key: DeckKey): void;
  /** Leave fullscreen → restore the previewPro panes. */
  exitFull(): void;
}

export const useUi = create<UiStore>((set) => ({
  mode: 'studio',
  settingsOpen: false,
  mappingOpen: false,
  midiSync: false,
  hinge: null,
  overlay: null,
  view: 'pads',
  preview: [],
  fulldeck: null,
  picking: false,

  setMode: (mode) => set({ mode }),
  setMidiSync: (midiSync) => set({ midiSync }),
  setHinge: (hinge) => set({ hinge }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMappingOpen: (mappingOpen) => set({ mappingOpen }),
  setOverlay: (overlay) => set({ overlay }),

  openPreview: (key) => set({ view: 'preview', preview: [key], fulldeck: null, picking: false }),
  togglePicker: () => set((s) => (s.view === 'preview' && s.preview.length === 1 && !s.fulldeck
    ? { picking: !s.picking }
    : { picking: false })),
  addModule: (key) => set((s) => {
    if (s.view !== 'preview' || s.preview.length >= 2 || s.preview.includes(key)) {
      return { picking: false };
    }
    return { preview: [...s.preview, key], picking: false };
  }),
  closePreview: () => set({ view: 'pads', preview: [], fulldeck: null, picking: false }),
  expand: (key) => set((s) => (s.view === 'preview' && s.preview.includes(key) && !s.fulldeck
    ? { view: 'full', fulldeck: key }
    : {})),
  exitFull: () => set((s) => ({
    view: s.preview.length > 0 ? 'preview' : 'pads',
    fulldeck: null,
  })),
}));