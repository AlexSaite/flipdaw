import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type LatencyPreset = 'fast' | 'standard' | 'safe';
export type Density = 'comfort' | 'dense';
export type MeterMode = 'ppm' | 'loudness';

export interface Settings {
  theme: Theme;
  latency: LatencyPreset;
  metroGain: number;        // 0..1
  metroEnabled: boolean;
  autosaveSec: number;      // 0 = off
  density: Density;
  /** Master meter: PPM peak (three-colour) or EBU R128-style loudness. */
  meterMode: MeterMode;
}

interface SettingsStore extends Settings {
  set(partial: Partial<Settings>): void;
  applyToDom(): void;
}

const KEY = 'flipdaw.settings';

const DEFAULTS: Settings = {
  theme: 'dark',
  latency: 'standard',
  metroGain: 0.6,
  metroEnabled: false,
  autosaveSec: 60,
  density: 'comfort',
  meterMode: 'ppm',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),

  set(partial) {
    const next = { ...get(), ...partial } as Settings;
    // A SettingsStore isn't a Settings subset — spread to the plain fields
    const plain: Settings = {
      theme: next.theme, latency: next.latency, metroGain: next.metroGain,
      metroEnabled: next.metroEnabled, autosaveSec: next.autosaveSec, density: next.density,
      meterMode: next.meterMode,
    };
    localStorage.setItem(KEY, JSON.stringify(plain));
    set(partial);
    get().applyToDom();
  },

  applyToDom() {
    const s = get();
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.dataset.density = s.density;
  },
}));