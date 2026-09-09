import { create } from 'zustand';

export type LayoutMode = 'laptop' | 'tent' | 'mixer';

interface UiStore {
  mode: LayoutMode;
  settingsOpen: boolean;
  mappingOpen: boolean;
  midiSync: boolean;
  /** Last hinge angle reported by the sensor (or simulated), degrees. */
  hinge: number | null;
  setMode(mode: LayoutMode): void;
  setMidiSync(on: boolean): void;
  setHinge(angle: number): void;
  setSettingsOpen(open: boolean): void;
  setMappingOpen(open: boolean): void;
}

export const useUi = create<UiStore>((set) => ({
  mode: 'laptop',
  settingsOpen: false,
  mappingOpen: false,
  midiSync: false,
  hinge: null,
  setMode: (mode) => set({ mode }),
  setMidiSync: (midiSync) => set({ midiSync }),
  setHinge: (hinge) => set({ hinge }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMappingOpen: (mappingOpen) => set({ mappingOpen }),
}));