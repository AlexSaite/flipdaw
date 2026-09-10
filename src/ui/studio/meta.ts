import type { DeckKey } from '../../store/ui';

/** Module-wall metadata: one entry per Studio instrument deck. */
export const DECK_META: { key: DeckKey; label: string; title: string; model: string; name: string }[] = [
  { key: 'grid', label: 'Grid', title: 'Clip grid', model: 'LAUNCHPAD', name: 'CLIP GRID' },
  { key: 'drum', label: 'Drum', title: 'Step sequencer', model: 'TR-909', name: 'DRUM SEQUENCER' },
  { key: 'piano', label: 'Piano', title: 'Keys', model: 'VL-1', name: 'MONO KEYS' },
  { key: 'sampler', label: 'Sampler', title: 'Pad sampler', model: 'MPC', name: 'PAD SAMPLER' },
  { key: 'dj', label: 'Decks', title: 'DJ decks', model: 'CDJ-900NXS', name: 'DJ STATION' },
  { key: 'tt', label: 'Vinyl', title: 'Turntable', model: 'SL-1200MK5', name: 'TURNTABLE' },
];

export function deckMeta(d: DeckKey): { label: string; title: string; model: string; name: string } {
  return DECK_META.find((x) => x.key === d) ?? DECK_META[0];
}