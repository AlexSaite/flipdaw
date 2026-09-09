import { create } from 'zustand';

export type LayoutMode = 'laptop' | 'tent' | 'mixer';

interface UiStore {
  mode: LayoutMode;
  settingsOpen: boolean;
  mappingOpen: boolean;
  setMode(mode: LayoutMode): void;
  setSettingsOpen(open: boolean): void;
  setMappingOpen(open: boolean): void;
}

export const useUi = create<UiStore>((set) => ({
  mode: 'laptop',
  settingsOpen: false,
  mappingOpen: false,
  setMode: (mode) => set({ mode }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setMappingOpen: (mappingOpen) => set({ mappingOpen }),
}));