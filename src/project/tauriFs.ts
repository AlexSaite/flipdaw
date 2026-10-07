/**
 * FlipDAW — Tauri filesystem adapter (ADR-003).
 * Browser builds use File System Access API; inside the desktop shell all project data
 * lives under the app data folder (writable under MSIX/Store packaging, where the app
 * directory itself is read-only) and every sandboxed path is resolved by the Rust side.
 *
 * The app only talks to DirHandle/FsAdapter, never to a specific backend.
 */

import type { DirHandle, FsAdapter, RecentProject } from './fsAdapter';

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type OpenFn = (opts: { directory: boolean; multiple: boolean; title?: string }) => Promise<string | null>;

let invoke: Invoke | null = null;
let openFn: OpenFn | null = null;
let cachedRoot: string | null = null;

/** Test seam: injects the bridge instead of resolving it from the Tauri runtime. */
export function __setTauriBridge(nextInvoke: Invoke | null, nextOpen?: OpenFn | null): void {
  invoke = nextInvoke;
  openFn = nextOpen ?? null;
  cachedRoot = null;
}

async function core(): Promise<Invoke> {
  if (invoke) return invoke;
  const mod = await import('@tauri-apps/api/core');
  invoke = mod.invoke as Invoke;
  return invoke;
}

async function openFolderDialog(startDir?: string): Promise<string | null> {
  if (openFn) return openFn({ directory: true, multiple: false, title: 'Select a FlipDAW project folder' });
  const call = await core();
  // The Rust side owns the picker: only a folder the user actually chose becomes a
  // trusted root, so a compromised renderer cannot register arbitrary paths.
  return call<string | null>('pick_folder', { startDir: startDir ?? null });
}

/** Absolute path of the app data folder (created on demand by the Rust side). */
export async function dataRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const call = await core();
  cachedRoot = await call<string>('app_data_dir');
  return cachedRoot;
}

function join(root: string, rel: string): string {
  const parts = rel.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  return parts.length ? `${root}/${parts.join('/')}` : root;
}

function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '');
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return idx === -1 ? clean : clean.slice(idx + 1);
}

function isMissing(err: unknown): boolean {
  const s = String(err).toLowerCase();
  return s.includes('not found') || s.includes('cannot find') || s.includes('enoent');
}

/** Binary payloads cross IPC as base64 (a byte array for a 10 MB WAV would be enormous). */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Folder outside the sandbox, reached through the native folder picker.
 * Access is granted by the Rust side for the current session only: `external_*` commands
 * reject anything outside a folder the user picked, and the web layer cannot add roots.
 */
export class ExternalDir implements DirHandle {
  readonly name: string;
  readonly root: string;
  constructor(root: string) {
    this.root = root;
    this.name = basename(root) || 'project';
  }
  async readText(rel: string): Promise<string | null> {
    const b = await this.readBinary(rel);
    return b === null ? null : new TextDecoder().decode(b);
  }
  async writeText(rel: string, text: string): Promise<void> {
    await this.writeBinary(rel, new TextEncoder().encode(text));
  }
  async readBinary(rel: string): Promise<Uint8Array | null> {
    const call = await core();
    try {
      const raw = await call<string | null>('external_read', { path: join(this.root, rel) });
      return raw === null ? null : fromBase64(raw);
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }
  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    const call = await core();
    await call('external_write', { path: join(this.root, rel), contents: toBase64(data) });
  }
  async exists(rel: string): Promise<boolean> {
    const call = await core();
    try {
      return await call<boolean>('external_exists', { path: join(this.root, rel) });
    } catch (err) {
      if (isMissing(err)) return false;
      throw err;
    }
  }
}

/** Project folder inside the app data root: projects/<name> */
class AppDataDir implements DirHandle {
  readonly name: string;
  readonly rel: string;
  constructor(rel: string, name?: string) {
    this.rel = rel;
    this.name = name ?? basename(rel);
  }
  async readText(rel: string): Promise<string | null> {
    const call = await core();
    return call<string | null>('read_text', { path: join(this.rel, rel) });
  }
  async writeText(rel: string, text: string): Promise<void> {
    const call = await core();
    await call('write_text', { path: join(this.rel, rel), contents: text });
  }
  async readBinary(rel: string): Promise<Uint8Array | null> {
    const call = await core();
    const raw = await call<string | null>('read_binary', { path: join(this.rel, rel) });
    return raw === null ? null : fromBase64(raw);
  }
  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    const call = await core();
    await call('write_binary', { path: join(this.rel, rel), contents: toBase64(data) });
  }
  async exists(rel: string): Promise<boolean> {
    const call = await core();
    return call<boolean>('exists', { path: join(this.rel, rel) });
  }
}

interface RecentEntry {
  name: string;
  path: string;
  external: boolean;
}

const RECENT_FILE = 'recent.json';
const PROJECTS_DIR = 'projects';

async function readRecent(): Promise<RecentEntry[]> {
  const call = await core();
  try {
    const raw = await call<string | null>('read_text', { path: RECENT_FILE });
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeRecent(list: RecentEntry[]): Promise<void> {
  const call = await core();
  await call('write_text', { path: RECENT_FILE, contents: JSON.stringify(list, null, 2) });
}

function handleFor(entry: RecentEntry): DirHandle {
  return entry.external
    ? new ExternalDir(entry.path)
    : new AppDataDir(`${PROJECTS_DIR}/${entry.name}`, entry.name);
}

/** Project folders stored inside the app data folder. */
export async function listStoredProjects(): Promise<{ name: string; handle: DirHandle }[]> {
  const call = await core();
  let names: string[];
  try {
    names = await call<string[]>('list_projects', { path: PROJECTS_DIR });
  } catch {
    return [];
  }
  return names.map((name) => ({ name, handle: new AppDataDir(`${PROJECTS_DIR}/${name}`, name) }));
}

export function createTauriFsAdapter(): FsAdapter {
  return {
    async pickDirectory() {
      const picked = await openFolderDialog();
      if (!picked) return null;
      return new ExternalDir(picked);
    },
    async recent(): Promise<RecentProject[]> {
      const list = await readRecent();
      return list.map((e) => ({ name: e.name, handle: handleFor(e) }));
    },
    async saveRecent(p: RecentProject) {
      const external = !(p.handle instanceof AppDataDir);
      const path = external ? (p.handle as ExternalDir).root : await dataRoot();
      const list = await readRecent();
      const next: RecentEntry[] = [
        { name: p.name, path, external },
        ...list.filter((e) => e.name !== p.name),
      ].slice(0, 8);
      await writeRecent(next);
    },
  };
}

/** True when running inside the Tauri shell (the runtime injects window.__TAURI_INTERNALS__). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
