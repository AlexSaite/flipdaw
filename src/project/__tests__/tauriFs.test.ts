import { afterEach, describe, expect, it } from 'vitest';
import { __setTauriBridge, createTauriFsAdapter, listStoredProjects } from '../tauriFs';

/** In-memory stand-in for the Rust fs commands. */
function fakeInvoke() {
  const files = new Map<string, string | number[]>();
  const dirs = new Set<string>(['projects']);
  const calls: string[] = [];
  const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push(cmd);
    const path = String(args?.path ?? '');
    switch (cmd) {
      case 'app_data_dir':
        return 'C:/AppData/dev.flipdaw.app' as T;
      case 'read_text': {
        const v = files.get(path);
        return (v === undefined ? null : String(v)) as T;
      }
      case 'write_text':
        files.set(path, String(args?.contents));
        return undefined as T;
      case 'read_binary': {
        const v = files.get(path);
        return (v === undefined ? null : (Array.isArray(v) ? v : [...String(v).split('').map((c) => c.charCodeAt(0))])) as T;
      }
      case 'write_binary':
        files.set(path, args?.contents as number[]);
        return undefined as T;
      case 'exists':
        return files.has(path) as T;
      case 'list_projects': {
        if (!dirs.has(path)) return [] as T;
        return [...files.keys()]
          .filter((p) => p.startsWith(`${path}/`) && p.endsWith('/project.json'))
          .map((p) => p.split('/')[1])
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort() as T;
      }
      case 'external_read': {
        const v = files.get(path);
        if (v === undefined) return null as T;
        return (Array.isArray(v) ? v : [...String(v).split('').map((c) => c.charCodeAt(0))]) as T;
      }
      case 'external_write':
        files.set(path, args?.contents as number[]);
        return undefined as T;
      case 'external_exists':
        return files.has(path) as T;
      default:
        throw new Error(`unexpected command: ${cmd}`);
    }
  };
  return { invoke, files, dirs, calls };
}

afterEach(() => {
  __setTauriBridge(null);
});

describe('tauri fs adapter', () => {
  it('round-trips text and binary through the sandboxed commands', async () => {
    const fs = fakeInvoke();
    __setTauriBridge(fs.invoke);

    const { ExternalDir } = await import('../tauriFs');
    const dir = new ExternalDir('D:/beats/myset');

    await dir.writeText('project.json', '{"name":"myset"}');
    expect(await dir.readText('project.json')).toBe('{"name":"myset"}');
    expect(await dir.exists('project.json')).toBe(true);
    expect(await dir.exists('nope.json')).toBe(false);

    const bytes = new Uint8Array([1, 2, 250, 255]);
    await dir.writeBinary('samples/a.wav', bytes);
    expect(Array.from((await dir.readBinary('samples/a.wav'))!)).toEqual([1, 2, 250, 255]);
    expect(fs.calls).toContain('external_write');
  });

  it('treats a missing external file as null, not an error', async () => {
    const fs = fakeInvoke();
    __setTauriBridge(fs.invoke);
    const { ExternalDir } = await import('../tauriFs');
    const dir = new ExternalDir('D:/beats/empty');
    expect(await dir.readText('project.json')).toBeNull();
    expect(await dir.readBinary('samples/x.wav')).toBeNull();
  });

  it('lists stored projects and resolves each to a working handle', async () => {
    const fs = fakeInvoke();
    __setTauriBridge(fs.invoke);
    fs.files.set('projects/alpha/project.json', '{"name":"alpha"}');
    fs.files.set('projects/beta/project.json', '{"name":"beta"}');
    fs.files.set('projects/notes.txt', 'ignored');

    const stored = await listStoredProjects();
    expect(stored.map((p) => p.name)).toEqual(['alpha', 'beta']);
    expect(await stored[0].handle.readText('project.json')).toBe('{"name":"alpha"}');
    expect(stored[1].handle.name).toBe('beta');
  });

  it('persists recents, newest first, without duplicates', async () => {
    const fs = fakeInvoke();
    __setTauriBridge(fs.invoke, async () => 'D:/beats/alpha');
    const adapter = createTauriFsAdapter();

    const a = await adapter.pickDirectory();
    expect(a?.name).toBe('alpha');
    await adapter.saveRecent({ name: 'alpha', handle: a! });

    __setTauriBridge(fs.invoke, async () => 'D:/beats/beta');
    const b = await adapter.pickDirectory();
    await adapter.saveRecent({ name: 'beta', handle: b! });
    await adapter.saveRecent({ name: 'alpha', handle: a! });

    const recent = await adapter.recent();
    expect(recent.map((r) => r.name)).toEqual(['alpha', 'beta']);
    expect(await recent[0].handle.readText('project.json')).toBeNull();
  });

  it('returns null when the folder dialog is cancelled', async () => {
    const fs = fakeInvoke();
    __setTauriBridge(fs.invoke, async () => null);
    const adapter = createTauriFsAdapter();
    expect(await adapter.pickDirectory()).toBeNull();
  });
});
