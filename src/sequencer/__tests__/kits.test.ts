import { describe, expect, it } from 'vitest';
import { KIT_PRESETS, kitLabel, kitLabelAt, kitVoiceAt, MAX_KIT_ROWS } from '../kits';
import { MAX_ROWS } from '../model';

describe('drum kit bank', () => {
  it('maps 16 voices, one per grid row', () => {
    expect(MAX_KIT_ROWS).toBe(MAX_ROWS);
    expect(KIT_PRESETS).toHaveLength(16);
  });

  it('starts with the kick and assigns per-row voices deterministically', () => {
    expect(KIT_PRESETS[0].voice).toBe('kick');
    expect(kitVoiceAt(0)).toBe('kick');
    expect(kitVoiceAt(1)).toBe('snare');
    expect(kitVoiceAt(15)).toBe(KIT_PRESETS[15].voice);
  });

  it('labels voices (and sample ids) sensibly', () => {
    expect(kitLabel('kick')).toBe('Kick');
    expect(kitLabelAt(3)).toBe('Hat');
    expect(kitLabel('smp:abc')).toBe('Smp');
  });
});