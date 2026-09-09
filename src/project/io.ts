/**
 * FlipDAW — project serialization (ADR-005, ADR-006).
 * serializeProject -> pretty JSON; parseProject -> validated ProjectSchema.
 */

import type { ProjectSchema } from './schema';
import { SCHEMA_VERSION, validateProject } from './schema';

export function serializeProject(p: ProjectSchema): string {
  const stamped: ProjectSchema = {
    ...p,
    meta: { ...p.meta, version: SCHEMA_VERSION, updatedAt: new Date().toISOString() },
  };
  return JSON.stringify(stamped, null, 2) + '\n';
}

/** Parse + validate. Returns { project } or { error }. */
export function parseProject(text: string): { project: ProjectSchema } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'invalid JSON' };
  }
  const res = validateProject(raw);
  if (!res.ok) return { error: res.errors.join('; ') };
  return { project: raw as ProjectSchema };
}
