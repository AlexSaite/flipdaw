import { describe, it, expect, beforeEach } from 'vitest';
import { useUi, type DeckKey, type StudioView } from '../ui';

const INITIAL = {
  mode: 'studio' as const,
  settingsOpen: false,
  mappingOpen: false,
  midiSync: false,
  hinge: null,
  overlay: null,
  view: 'pads' as StudioView,
  preview: [] as DeckKey[],
  fulldeck: null,
  picking: false,
};

beforeEach(() => {
  useUi.setState(INITIAL);
});

describe('useUi studio canvas (pads → previewPro → fullscreen)', () => {
  it('starts on the pads grid with nothing open', () => {
    expect(useUi.getState().view).toBe('pads');
    expect(useUi.getState().preview).toEqual([]);
  });

  it('pad tap opens previewPro with one chosen module', () => {
    useUi.getState().openPreview('drum');
    const s = useUi.getState();
    expect(s.view).toBe('preview');
    expect(s.preview).toEqual(['drum']);
    expect(s.picking).toBe(false);
  });

  it('togglePicker flips the add-zone only in single-module previewPro', () => {
    useUi.getState().openPreview('drum');
    useUi.getState().togglePicker();
    expect(useUi.getState().picking).toBe(true);
    useUi.getState().togglePicker();
    expect(useUi.getState().picking).toBe(false);
  });

  it('adding a second module gives two interactive panes', () => {
    useUi.getState().openPreview('drum');
    useUi.getState().addModule('piano');
    const s = useUi.getState();
    expect(s.preview).toEqual(['drum', 'piano']);
    expect(s.picking).toBe(false);
    expect(s.view).toBe('preview');
  });

  it('addModule ignores a duplicate or a 3rd module (max 2)', () => {
    useUi.getState().openPreview('drum');
    useUi.getState().addModule('piano');
    useUi.getState().addModule('piano');
    useUi.getState().addModule('dj');
    expect(useUi.getState().preview).toEqual(['drum', 'piano']);
  });

  it('closePreview goes back to the pads grid and clears previewPro', () => {
    useUi.getState().openPreview('drum');
    useUi.getState().addModule('piano');
    useUi.getState().closePreview();
    const s = useUi.getState();
    expect(s.view).toBe('pads');
    expect(s.preview).toEqual([]);
    expect(s.fulldeck).toBeNull();
    expect(s.picking).toBe(false);
  });

  it('expanding a pane enters fullscreen, the other pane is restored on exit', () => {
    useUi.getState().openPreview('grid');
    useUi.getState().addModule('sampler');
    useUi.getState().expand('sampler');
    const s = useUi.getState();
    expect(s.view).toBe('full');
    expect(s.fulldeck).toBe('sampler');
    expect(s.preview).toEqual(['grid', 'sampler']); // kept to restore

    useUi.getState().exitFull();
    const s2 = useUi.getState();
    expect(s2.view).toBe('preview');
    expect(s2.fulldeck).toBeNull();
    expect(s2.preview).toEqual(['grid', 'sampler']);
  });

  it('exitFull returns to the previewPro stage with the module still there', () => {
    useUi.getState().openPreview('tt');
    useUi.getState().expand('tt');
    useUi.getState().exitFull();
    expect(useUi.getState().view).toBe('preview');
    expect(useUi.getState().preview).toEqual(['tt']);
  });

  it('expand is a no-op for a module not in previewPro', () => {
    useUi.getState().openPreview('drum');
    useUi.getState().expand('tt');
    expect(useUi.getState().view).toBe('preview');
    expect(useUi.getState().fulldeck).toBeNull();
  });

  it('overlay opens the single mixer panel only', () => {
    useUi.getState().setOverlay('mixer');
    expect(useUi.getState().overlay).toBe('mixer');
    useUi.getState().setOverlay(null);
    expect(useUi.getState().overlay).toBeNull();
  });
});