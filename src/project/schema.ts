/**
 * FlipDAW — project schema (ADR-005: human-readable JSON).
 * SCHEMA_VERSION bump = incompatible structural change.
 */

export const SCHEMA_VERSION = 1 as const;
export const MAX_TRACKS = 16;
export const MAX_SCENES = 16;

export interface ProjectMeta {
  name: string;
  version: typeof SCHEMA_VERSION;
  bpm: number;
  timeSig: readonly [number, number];
  updatedAt: string; // ISO
}

export interface ClipSchema {
  id: string;
  file: string;          // samples/<sha256>.wav
  type: 'loop' | 'oneshot';
  lengthBeats: number;
  gain: number;          // 0..1
  scene: number;
}

export interface TrackSchema {
  id: string;
  name: string;
  color: string;
  gain: number;          // 0..1
  pan: number;           // -1..1
  muted: boolean;
  solo: boolean;
  clips: ClipSchema[];
}

export interface ProjectSchema {
  meta: ProjectMeta;
  sceneCount: number;
  tracks: TrackSchema[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateProject(p: unknown): ValidationResult {
  const errors: string[] = [];
  if (!p || typeof p !== 'object') {
    errors.push('project is not an object');
    return { ok: false, errors };
  }
  const root = p as Partial<ProjectSchema>;

  if (!root.meta || typeof root.meta !== 'object') errors.push('meta missing');
  else {
    const m = root.meta;
    if (typeof m.name !== 'string' || m.name.trim() === '') errors.push('meta.name invalid');
    if (m.version !== SCHEMA_VERSION) errors.push(`meta.version must be ${SCHEMA_VERSION}`);
    if (typeof m.bpm !== 'number' || m.bpm < 40 || m.bpm > 240) errors.push('meta.bpm out of range');
    if (!Array.isArray(m.timeSig) || m.timeSig.length !== 2 ||
        typeof m.timeSig[0] !== 'number' || typeof m.timeSig[1] !== 'number') {
      errors.push('meta.timeSig invalid');
    }
  }

  if (typeof root.sceneCount !== 'number' || root.sceneCount < 1 || root.sceneCount > MAX_SCENES) {
    errors.push(`sceneCount must be 1..${MAX_SCENES}`);
  }

  if (!Array.isArray(root.tracks)) errors.push('tracks must be an array');
  else {
    if (root.tracks.length > MAX_TRACKS) errors.push(`too many tracks (max ${MAX_TRACKS})`);
    root.tracks.forEach((t, i) => {
      if (!t || typeof t !== 'object') { errors.push(`tracks[${i}] invalid`); return; }
      const tk = t as Partial<TrackSchema>;
      if (typeof tk.id !== 'string' || tk.id === '') errors.push(`tracks[${i}].id invalid`);
      if (typeof tk.name !== 'string') errors.push(`tracks[${i}].name invalid`);
      if (typeof tk.gain !== 'number' || tk.gain < 0 || tk.gain > 1) errors.push(`tracks[${i}].gain invalid`);
      if (typeof tk.pan !== 'number' || tk.pan < -1 || tk.pan > 1) errors.push(`tracks[${i}].pan invalid`);
      if (typeof tk.muted !== 'boolean') errors.push(`tracks[${i}].muted invalid`);
      if (typeof tk.solo !== 'boolean') errors.push(`tracks[${i}].solo invalid`);
      if (!Array.isArray(tk.clips)) errors.push(`tracks[${i}].clips invalid`);
    });
  }

  return { ok: errors.length === 0, errors };
}
