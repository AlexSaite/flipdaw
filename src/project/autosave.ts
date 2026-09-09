/**
 * FlipDAW — autosave backup rotation (3 generations).
 *   current -> project.json
 *   1 back  -> project.bak1
 *   2 back  -> project.bak2
 * Writing a new snapshot rotates existing files and drops the oldest.
 */

import type { DirHandle } from './fsAdapter';

const CURRENT = 'project.json';
const BACKUP_1 = 'project.bak1';
const BACKUP_2 = 'project.bak2';

/**
 * Save a fresh project snapshot with 3-generation rotation.
 * @param data serialized project text
 */
export async function rotateAndSave(dir: DirHandle, data: string): Promise<void> {
  const [cur, b1] = await Promise.all([dir.readText(CURRENT), dir.readText(BACKUP_1)]);
  if (b1) await dir.writeText(BACKUP_2, b1);
  if (cur) await dir.writeText(BACKUP_1, cur);
  await dir.writeText(CURRENT, data);
}

/** Most recent recoverable backup, or null. */
export async function newestBackup(dir: DirHandle): Promise<string | null> {
  return (await dir.readText(BACKUP_1)) ?? (await dir.readText(BACKUP_2));
}

export interface BackupInfo {
  hasCurrent: boolean;
  generation: number; // number of backup generations present (0..2)
  oldestGeneration: number; // 0 = bak1 present, 1 = bak2 present
}

/** Inspect an installed project dir for restore offer. */
export async function backupInfo(dir: DirHandle): Promise<BackupInfo> {
  const [cur, b1, b2] = await Promise.all([
    dir.exists(CURRENT),
    dir.exists(BACKUP_1),
    dir.exists(BACKUP_2),
  ]);
  let generation = 0;
  if (b2) generation = 2;
  else if (b1) generation = 1;
  return { hasCurrent: cur, generation, oldestGeneration: generation };
}