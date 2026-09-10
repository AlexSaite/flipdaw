import { describe, it, expect, beforeEach } from 'vitest';
import { useUi, type DeckKey } from '../ui';

const INITIAL = {
  mode: 'studio' as const,
  settingsOpen: false,
  mappingOpen: false,
  midiSync: false,
  hinge: null,
  open: [] as DeckKey[],
  focused: null,
  overlay: null,
};

beforeEach(() => {
  useUi.setState(INITIAL);
});

describe('useUi studio wall', () => {
  it('toggleOpen appends a closed module and focuses it', () => {
    useUi.getState().toggleOpen('drum');
    expect(useUi.getState().open).toEqual(['drum']);
    expect(useUi.getState().focused).toBe('drum');
  });

  it('toggleOpen on an open module only refocuses (no duplicate)', () => {
    useUi.getState().toggleOpen('drum');
    useUi.getState().toggleOpen('drum');
    expect(useUi.getState().open).toEqual(['drum']);
    expect(useUi.getState().focused).toBe('drum');
  });

  it('keeps interleaving order when opening several modules', () => {
    useUi.getState().toggleOpen('grid');
    useUi.getState().toggleOpen('piano');
    useUi.getState().toggleOpen('sampler');
    expect(useUi.getState().open).toEqual(['grid', 'piano', 'sampler']);
    expect(useUi.getState().focused).toBe('sampler');
  });

  it('allow up to 3+ simultaneous tiles (grid stays while piano plays)', () => {
    useUi.getState().toggleOpen('grid');
    useUi.getState().toggleOpen('piano');
    useUi.getState().toggleOpen('dj');
    expect(useUi.getState().open).toHaveLength(3);
    expect(useUi.getState().open).toContain('grid');
  });

  it('focus only highlights, does not change the open set', () => {
    useUi.getState().toggleOpen('grid');
    useUi.getState().toggleOpen('tt');
    useUi.getState().focus('grid');
    expect(useUi.getState().focused).toBe('grid');
    expect(useUi.getState().open).toEqual(['grid', 'tt']);
  });

  it('solo expands one tile to fill the stage', () => {
    useUi.getState().toggleOpen('grid');
    useUi.getState().toggleOpen('tt');
    useUi.getState().solo('tt');
    expect(useUi.getState().open).toEqual(['tt']);
    expect(useUi.getState().focused).toBe('tt');
  });

  it('closeTile removes a non-focused tile and keeps focus', () => {
    useUi.getState().toggleOpen('grid');
    useUi.getState().toggleOpen('tt');
    useUi.getState().focus('grid');
    useUi.getState().closeTile('tt');
    expect(useUi.getState().open).toEqual(['grid']);
    expect(useUi.getState().focused).toBe('grid');
  });

  it('closeTile of the focused tile falls back to the last remaining', () => {
    useUi.getState().toggleOpen('grid');
    useUi.getState().toggleOpen('piano');
    useUi.getState().toggleOpen('sampler');
    useUi.getState().closeTile('sampler');
    expect(useUi.getState().open).toEqual(['grid', 'piano']);
    expect(useUi.getState().focused).toBe('piano');
  });

  it('closeTile of the last tile clears both set and focus', () => {
    useUi.getState().solo('dj');
    useUi.getState().closeTile('dj');
    expect(useUi.getState().open).toEqual([]);
    expect(useUi.getState().focused).toBeNull();
  });

  it('overlay panel can be opened and closed', () => {
    useUi.getState().setOverlay('mixer');
    expect(useUi.getState().overlay).toBe('mixer');
    useUi.getState().setOverlay(null);
    expect(useUi.getState().overlay).toBeNull();
  });
});