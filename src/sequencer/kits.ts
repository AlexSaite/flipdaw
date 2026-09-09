/**
 * FlipDAW — drum kit bank (M6.4). 16 synth presets for the step-sequencer
 * grid. `voice` maps to the synth recipes in `stepVoice.ts`; `label` names
 * the row in the UI. Default first row is the kick, classic Launchpad grid
 * ordering (concept only — all voices are synthesized here).
 */

import { MAX_ROWS } from './model';

export interface KitVoice {
  voice: string;
  label: string;
}

export const KIT_PRESETS: KitVoice[] = [
  { voice: 'kick', label: 'Kick' },
  { voice: 'snare', label: 'Snare' },
  { voice: 'clap', label: 'Clap' },
  { voice: 'hat', label: 'Hat' },
  { voice: 'openhat', label: 'OHat' },
  { voice: 'tom', label: 'Tom' },
  { voice: 'ride', label: 'Ride' },
  { voice: 'rim', label: 'Rim' },
  { voice: 'perc', label: 'Perc' },
  { voice: 'shaker', label: 'Shk' },
  { voice: 'tom', label: 'FloT' },
  { voice: 'perc', label: 'Perc2' },
  { voice: 'shaker', label: 'Shk2' },
  { voice: 'kick', label: 'Sub' },
  { voice: 'hat', label: 'Hat2' },
  { voice: 'snare', label: 'Snr2' },
];

export const MAX_KIT_ROWS = MAX_ROWS;

/** Voice id for row `r` of the default kit (exported for tests/UI). */
export function kitVoiceAt(r: number): string {
  return KIT_PRESETS[((r % KIT_PRESETS.length) + KIT_PRESETS.length) % KIT_PRESETS.length].voice;
}

export function kitLabelAt(r: number): string {
  return KIT_PRESETS[((r % KIT_PRESETS.length) + KIT_PRESETS.length) % KIT_PRESETS.length].label;
}

export function kitLabel(voice: string): string {
  const found = KIT_PRESETS.find((v) => v.voice === voice);
  return found?.label ?? (voice.startsWith('smp:') ? 'Smp' : voice);
}