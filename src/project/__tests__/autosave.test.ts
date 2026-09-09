import { describe, expect, it } from 'vitest';
import { rotateAndSave, newestBackup, backupInfo } from '../autosave';
import { MemoryDir } from '../fsAdapter';

describe('autosave rotation', () => {
  it('backs up the previous snapshot each save (3 generations)', async () => {
    const dir = new MemoryDir();
    await rotateAndSave(dir, 'v1');
    await rotateAndSave(dir, 'v2');
    await rotateAndSave(dir, 'v3');
    expect(await dir.readText('project.json')).toBe('v3');
    expect(await dir.readText('project.bak1')).toBe('v2');
    expect(await dir.readText('project.bak2')).toBe('v1');
  });

  it('drops the oldest generation on the 4th save', async () => {
    const dir = new MemoryDir();
    for (const v of ['v1', 'v2', 'v3', 'v4']) await rotateAndSave(dir, v);
    expect(await dir.readText('project.json')).toBe('v4');
    expect(await dir.readText('project.bak1')).toBe('v3');
    expect(await dir.readText('project.bak2')).toBe('v2');
    expect(await dir.exists('project.bak2')).toBe(true);
  });

  it('works from a cold directory (no current yet)', async () => {
    const dir = new MemoryDir();
    await rotateAndSave(dir, 'only');
    expect(await dir.readText('project.json')).toBe('only');
    expect(await dir.readText('project.bak1')).toBeNull();
    expect(await dir.readText('project.bak2')).toBeNull();
  });

  it('newestBackup prefers bak1', async () => {
    const dir = new MemoryDir();
    await rotateAndSave(dir, 'a');
    await rotateAndSave(dir, 'b');
    expect(await newestBackup(dir)).toBe('a');
  });

  it('newestBackup falls back to bak2', async () => {
    const dir = new MemoryDir();
    await rotateAndSave(dir, 'a');
    await rotateAndSave(dir, 'b');
    await rotateAndSave(dir, 'c');
    // bak2 = a (bak1 = b)
    expect(await newestBackup(dir)).toBe('b');
  });

  it('newestBackup returns null on empty dir', async () => {
    const dir = new MemoryDir();
    expect(await newestBackup(dir)).toBeNull();
  });

  it('backupInfo reports generations', async () => {
    const dir = new MemoryDir();
    expect(await backupInfo(dir)).toEqual({ hasCurrent: false, generation: 0, oldestGeneration: 0 });
    await rotateAndSave(dir, 'a');
    expect(await backupInfo(dir)).toEqual({ hasCurrent: true, generation: 0, oldestGeneration: 0 });
    await rotateAndSave(dir, 'b');
    expect(await backupInfo(dir)).toEqual({ hasCurrent: true, generation: 1, oldestGeneration: 1 });
    await rotateAndSave(dir, 'c');
    expect(await backupInfo(dir)).toEqual({ hasCurrent: true, generation: 2, oldestGeneration: 2 });
  });
});