/**
 * FlipDAW — filesystem abstraction (ADR-003).
 * In browser: File System Access API. In Tauri: plugin-fs.
 * The app only talks to DirHandle/FsAdapter, never to a specific backend.
 */

export interface DirHandle {
  readonly name: string;
  readText(rel: string): Promise<string | null>;
  writeText(rel: string, text: string): Promise<void>;
  readBinary(rel: string): Promise<Uint8Array | null>;
  writeBinary(rel: string, data: Uint8Array): Promise<void>;
  exists(rel: string): Promise<boolean>;
}

export interface RecentProject {
  name: string;
  handle: DirHandle;
}

export interface FsAdapter {
  pickDirectory(): Promise<DirHandle | null>;
  /** Persisted list of recently opened projects (most recent first). */
  recent(): Promise<RecentProject[]>;
  saveRecent(p: RecentProject): Promise<void>;
}

/**
 * In-memory DirHandle — for tests and as a fallback before real FS.
 * Wraps a flat map keyed by relative path.
 */
export class MemoryDir implements DirHandle {
  readonly name: string;
  private files = new Map<string, Uint8Array>();

  constructor(name = 'memory', files?: Record<string, string>) {
    this.name = name;
    if (files) {
      for (const [k, v] of Object.entries(files)) this.files.set(k, new TextEncoder().encode(v));
    }
  }

  async readBinary(rel: string): Promise<Uint8Array | null> {
    return this.files.get(norm(rel)) ?? null;
  }
  async writeBinary(rel: string, data: Uint8Array): Promise<void> {
    this.files.set(norm(rel), data.slice());
  }
  async readText(rel: string): Promise<string | null> {
    const b = await this.readBinary(rel);
    return b ? new TextDecoder().decode(b) : null;
  }
  async writeText(rel: string, text: string): Promise<void> {
    await this.writeBinary(rel, new TextEncoder().encode(text));
  }
  async exists(rel: string): Promise<boolean> {
    return this.files.has(norm(rel));
  }
  list(): string[] { return [...this.files.keys()].sort(); }
}

/** Browser default adapter using File System Access API. */
export function createBrowserFsAdapter(): FsAdapter {
  return {
    async pickDirectory() {
      const w = window as unknown as { showDirectoryPicker?: () => Promise<unknown> };
      if (!w.showDirectoryPicker) return null;
      const raw = await w.showDirectoryPicker();
      return wrapRawDir(raw as BrowserFileSystemDirectoryHandle);
    },
    async recent() {
      try {
        const raw = localStorage.getItem('flipdaw.recent');
        if (!raw) return [];
        return JSON.parse(raw) as RecentProject[];
      } catch {
        return [];
      }
    },
    async saveRecent(p) {
      const list = await this.recent();
      const next = [p, ...list.filter((r) => r.name !== p.name)].slice(0, 8);
      localStorage.setItem('flipdaw.recent', JSON.stringify(next));
    },
  };
}

/* ---- Browser File System Access handles (minimal structural typing) ---- */

interface BrowserFileHandle {
  getFile(): Promise<Blob>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
}

interface BrowserFileSystemDirectoryHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<BrowserFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<BrowserFileSystemDirectoryHandle>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<'granted' | 'prompt' | 'denied'>;
}

function norm(rel: string): string {
  return rel.replace(/[/\\]+/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
}

function wrapRawDir(raw: BrowserFileSystemDirectoryHandle): DirHandle {
  const ensure = async (): Promise<void> => {
    if (raw.queryPermission && raw.requestPermission) {
      if (await raw.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        await raw.requestPermission({ mode: 'readwrite' });
      }
    }
  };
  const parts = (rel: string): string[] => norm(rel).split('/').filter(Boolean);
  return {
    name: raw.name,
    async exists(rel) { await ensure(); return dirExists(raw, parts(rel)); },
    async readBinary(rel) {
      await ensure();
      const partsList = parts(rel);
      const leaf = partsList.pop();
      if (!leaf) return null;
      const parent = await walkDirs(raw, partsList);
      if (!parent) return null;
      try {
        const fh = await parent.getFileHandle(leaf);
        const blob = await fh.getFile();
        return new Uint8Array(await blob.arrayBuffer());
      } catch {
        return null;
      }
    },
    async writeBinary(rel, data) {
      await ensure();
      const partsList = parts(rel);
      const leaf = partsList.pop();
      if (!leaf) throw new Error(`bad path: ${rel}`);
      const parent = await wrapDirs(raw, partsList);
      const fh = await parent.getFileHandle(leaf, { create: true });
      const w = await fh.createWritable();
      await w.write(new Blob([data.buffer as ArrayBuffer]));
      await w.close();
    },
    async readText(rel) {
      const b = await this.readBinary(rel);
      return b ? new TextDecoder().decode(b) : null;
    },
    async writeText(rel, text) {
      await this.writeBinary(rel, new TextEncoder().encode(text));
    },
  };
}

async function walkDirs(
  raw: BrowserFileSystemDirectoryHandle,
  parts: string[],
): Promise<BrowserFileSystemDirectoryHandle | null> {
  let cur: BrowserFileSystemDirectoryHandle = raw;
  for (const p of parts) {
    try {
      cur = await cur.getDirectoryHandle(p);
    } catch {
      return null;
    }
  }
  return cur;
}

async function wrapDirs(
  raw: BrowserFileSystemDirectoryHandle,
  parts: string[],
): Promise<BrowserFileSystemDirectoryHandle> {
  let cur: BrowserFileSystemDirectoryHandle = raw;
  for (const p of parts) {
    cur = await cur.getDirectoryHandle(p, { create: true });
  }
  return cur;
}

async function dirExists(
  raw: BrowserFileSystemDirectoryHandle,
  parts: string[],
): Promise<boolean> {
  return (await walkDirs(raw, parts)) !== null;
}
