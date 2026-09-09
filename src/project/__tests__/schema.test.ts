import { describe, expect, it } from 'vitest';
import { validateProject, type ProjectSchema } from '../schema';

const good: ProjectSchema = {
  meta: {
    name: 'Test',
    version: 1,
    bpm: 120,
    timeSig: [4, 4],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  sceneCount: 4,
  tracks: [
    {
      id: 'drums', name: 'Drums', color: '#14b8a6',
      gain: 0.8, pan: 0, muted: false, solo: false,
      clips: [
        { id: 'drums:0', file: 'samples/abc.wav', type: 'loop', lengthBeats: 4, gain: 1, scene: 0 },
      ],
    },
  ],
};

describe('validateProject', () => {
  it('accepts a valid project', () => {
    expect(validateProject(good).ok).toBe(true);
  });

  it('rejects non-object', () => {
    expect(validateProject(null).ok).toBe(false);
    expect(validateProject('x').ok).toBe(false);
  });

  it('rejects bad version', () => {
    const bad = JSON.parse(JSON.stringify(good)) as ProjectSchema;
    bad.meta.version = 2 as unknown as 1;
    const res = validateProject(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join()).toContain('version');
  });

  it('rejects out-of-range bpm', () => {
    const bad = JSON.parse(JSON.stringify(good)) as ProjectSchema;
    bad.meta.bpm = 500;
    const res = validateProject(bad);
    expect(res.ok).toBe(false);
  });

  it('rejects bad sceneCount', () => {
    const bad = JSON.parse(JSON.stringify(good)) as ProjectSchema;
    bad.sceneCount = 0;
    expect(validateProject(bad).ok).toBe(false);
  });

  it('rejects too many tracks', () => {
    const bad: ProjectSchema = {
      ...good,
      tracks: Array.from({ length: 17 }, () => ({
        ...good.tracks[0],
        id: Math.random().toString(36),
        clips: [],
      })),
    };
    expect(validateProject(bad).ok).toBe(false);
  });

  it('rejects bad track gain', () => {
    const bad = JSON.parse(JSON.stringify(good)) as ProjectSchema;
    bad.tracks[0].gain = 5;
    expect(validateProject(bad).ok).toBe(false);
  });

  it('rejects empty track id', () => {
    const bad = JSON.parse(JSON.stringify(good)) as ProjectSchema;
    bad.tracks[0].id = '';
    expect(validateProject(bad).ok).toBe(false);
  });
});
