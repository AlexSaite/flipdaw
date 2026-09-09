import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => {
  const fakeStrip = () => ({
    setGain: vi.fn(), setPan: vi.fn(), setMute: vi.fn(), meter: () => 0,
  });
  const fakePlayer = () => ({
    onState: vi.fn(), attach: vi.fn(), detach: vi.fn(), setGain: vi.fn(),
    state: 'empty' as const,
  });
  return { fakeStrip, fakePlayer };
});

vi.mock('../../audio/engine', () => {
  const engine = {
    ctx: { currentTime: 0, createGain: () => ({ connect: vi.fn(), gain: { value: 1 } }) },
    transport: { bpm: 120 },
    metro: {},
    tapTempo: {},
    stripFor: () => h.fakeStrip(),
    playerFor: () => h.fakePlayer(),
    resume: vi.fn(),
  };
  return {
    getEngine: () => engine,
    createEngine: () => engine,
    hasEngine: () => true,
  };
});

vi.mock('../../audio/demoLoops', () => ({
  renderDemoLoops: () => Promise.resolve({ drums: [{}], bass: [{}], synth: [{}], keys: [{}] }),
}));

import { useGrid } from '../project';
import { useHistory } from '../history';

describe('project store ↔ history integration', () => {
  it('pushes a baseline on reset and undoes/redoes mix changes', async () => {
    await useGrid.getState().resetToDemo();

    expect(useHistory.getState().canUndo).toBe(false);

    useGrid.getState().setTrackGain('drums', 0.4);
    expect(useGrid.getState().tracks.find((t) => t.id === 'drums')?.gain).toBe(0.4);
    expect(useHistory.getState().canUndo).toBe(true);
    expect(useGrid.getState().editorStatus).toBe('dirty');

    useHistory.getState().undo();
    expect(useGrid.getState().tracks.find((t) => t.id === 'drums')?.gain).toBe(0.9);
    expect(useHistory.getState().canRedo).toBe(true);

    useHistory.getState().redo();
    expect(useGrid.getState().tracks.find((t) => t.id === 'drums')?.gain).toBe(0.4);
  });

  it('undos and redos a mute toggle', async () => {
    await useGrid.getState().resetToDemo();

    useGrid.getState().setTrackMute('bass', true);
    expect(useGrid.getState().tracks.find((t) => t.id === 'bass')?.muted).toBe(true);

    useHistory.getState().undo();
    expect(useGrid.getState().tracks.find((t) => t.id === 'bass')?.muted).toBe(false);

    useHistory.getState().redo();
    expect(useGrid.getState().tracks.find((t) => t.id === 'bass')?.muted).toBe(true);
  });
});