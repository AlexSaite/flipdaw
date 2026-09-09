import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../io';
import { SCHEMA_VERSION, type ProjectSchema } from '../schema';

const project: ProjectSchema = {
  meta: {
    name: 'Demo',
    version: SCHEMA_VERSION,
    bpm: 120,
    timeSig: [4, 4],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  sceneCount: 4,
  tracks: [
    {
      id: 'drums', name: 'Drums', color: '#14b8a6',
      gain: 0.8, pan: 0.25, muted: false, solo: true,
      clips: [
        { id: 'drums:0', file: 'samples/abc.wav', type: 'loop', lengthBeats: 4, gain: 0.9, scene: 0 },
      ],
    },
  ],
};

describe('io serialize/parse', () => {
  it('round-trips a project preserving gains, mutes, solo', () => {
    const text = serializeProject(project);
    const res = parseProject(text);
    expect('project' in res).toBe(true);
    const p = (res as { project: ProjectSchema }).project;
    expect(p.meta.version).toBe(SCHEMA_VERSION);
    expect(p.tracks[0].gain).toBe(0.8);
    expect(p.tracks[0].pan).toBe(0.25);
    expect(p.tracks[0].solo).toBe(true);
    expect(p.tracks[0].clips[0].file).toBe('samples/abc.wav');
  });

  it('serialize stamps version and updates updatedAt', () => {
    const stamped = JSON.parse(serializeProject(project)) as ProjectSchema;
    expect(stamped.meta.version).toBe(SCHEMA_VERSION);
    expect(new Date(stamped.meta.updatedAt).getTime()).toBeGreaterThan(
      new Date(project.meta.updatedAt).getTime(),
    );
  });

  it('parse rejects invalid JSON', () => {
    const res = parseProject('{ not json');
    expect('error' in res).toBe(true);
  });

  it('parse rejects structurally invalid project', () => {
    const res = parseProject(JSON.stringify({ meta: { version: 1 }, tracks: [] }));
    expect('error' in res).toBe(true);
  });
});
