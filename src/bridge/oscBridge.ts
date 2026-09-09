import { bridgeBus } from './bus';
import type { BridgeUnsub, OscMessage } from './bus';
import { encodeOscMessage, decodeOscMessage } from './osc';

export type OscProfileId = 'ableton' | 'reaper' | 'custom';

export interface OscRow {
  action: string;
  target: string;
}

export interface OscProfile {
  id: OscProfileId;
  name: string;
  rows: OscRow[];
}

const SCENE_ROWS = (prefix: string): OscRow[] =>
  Array.from({ length: 8 }, (_, i) => ({ action: `Scene ${i + 1}`, target: `${prefix}/scene/${i + 1}` }));

export const OSC_PROFILES: Record<OscProfileId, OscProfile> = {
  ableton: {
    id: 'ableton',
    name: 'Ableton Live',
    rows: [
      ...SCENE_ROWS('/ableton'),
      { action: 'Play', target: '/ableton/play' },
      { action: 'Stop', target: '/ableton/stop' },
    ],
  },
  reaper: {
    id: 'reaper',
    name: 'Reaper',
    rows: [
      ...SCENE_ROWS('/reaper'),
      { action: 'Play', target: '/reaper/play' },
      { action: 'Stop', target: '/reaper/stop' },
    ],
  },
  custom: { id: 'custom', name: 'Custom', rows: [{ action: 'Scene 1', target: '/scene/1' }] },
};

/** Deep copy of a profile's default template rows. */
export function templateRows(id: OscProfileId): OscRow[] {
  return OSC_PROFILES[id].rows.map((r) => ({ ...r }));
}

export interface OscTransport {
  send(bytes: Uint8Array<ArrayBuffer>): void;
  connect(): void;
  dispose(): void;
  readonly connected: boolean;
  onReceived?(cb: (msg: OscMessage) => void): void;
}

function actionFor(profile: OscProfile, address: string): string | null {
  for (const row of profile.rows) if (row.target === address) return row.action;
  return null;
}

function targetFor(profile: OscProfile, action: string): string | null {
  for (const row of profile.rows) if (row.action === action) return row.target;
  return null;
}

function sceneOf(action: string): number | null {
  const m = /^Scene (\d+)$/.exec(action);
  return m ? Number(m[1]) : null;
}

/**
 * OSC bridge: symmetric mapping between the app and a DAW.
 * Out — app actions (scene launch, play/stop) encode to the profile's addresses.
 * In  — OSC packets from the DAW (or dev bridge) map back to the same actions.
 */
export class OscBridge {
  private _profile: OscProfile;
  transport: OscTransport | null = null;
  private unsubs: BridgeUnsub[] = [];

  constructor(profileId: OscProfileId = 'ableton') {
    this._profile = OSC_PROFILES[profileId];
  }

  get profile(): OscProfile { return this._profile; }

  setProfile(id: OscProfileId): void {
    this._profile = OSC_PROFILES[id];
  }

  /** Replace the current profile while preserving the given rows (template edits). */
  load(id: OscProfileId, rows: OscRow[]): void {
    this._profile = { ...OSC_PROFILES[id], rows };
  }

  updateRow(i: number, patch: Partial<OscRow>): void {
    this._profile = {
      ...this._profile,
      rows: this._profile.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    };
  }

  /** Register a bridge transport (WebSocket dev bridge or Tauri UDP). */
  attach(transport: OscTransport): void {
    this.disposeListeners();
    this.transport = transport;
    transport.connect();
    transport.onReceived?.((msg) => this.handleIncoming(msg));
  }

  get connected(): boolean { return this.transport?.connected ?? false; }

  /** Out: send an already-mapped app action (e.g. "Scene 3", "Play"). */
  sendAction(action: string, ...numbers: number[]): void {
    const target = targetFor(this._profile, action);
    if (!target) return;
    this.send({ address: target, args: numbers.map((v) => ({ type: 'i', value: v })) });
  }

  sendScene(scene: number): void {
    this.sendAction(`Scene ${scene}`, 1);
  }

  send(msg: OscMessage): void {
    if (!this.transport?.connected) return;
    this.transport.send(encodeOscMessage(msg));
  }

  /** In: route a decoded OSC message. Emits `oscAction` for known rows. */
  handleIncoming(msg: OscMessage): void {
    bridgeBus.emit({ kind: 'osc', message: msg });
    const action = actionFor(this._profile, msg.address);
    if (!action) return;
    bridgeBus.emit({ kind: 'oscAction', action, args: msg.args.map((a) => typeof a.value === 'number' ? a.value : 0) });
    const scene = sceneOf(action);
    if (scene) this.sendAction(`Scene ${scene}`, 1); // handshake echo
  }

  dispose(): void {
    this.disposeListeners();
    this.transport?.dispose();
    this.transport = null;
  }

  private disposeListeners(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}

export const DEFAULT_BRIDGE_URL = 'ws://localhost:9001';

let oscBridge: OscBridge | null = null;

/** App-wide OSC bridge singleton (used by bind + MappingModal). */
export function getOscBridge(): OscBridge {
  oscBridge ??= new OscBridge();
  return oscBridge;
}

/** Stateless helper: replace the singleton profile + rows (UI template edits). */
export function bridgeLoad(id: OscProfileId, rows: OscRow[]): void {
  getOscBridge().load(id, rows);
}

/** Attach an existing OscBridge to the dev bridge socket. Async connect helper. */
export async function connectDevBridge(bridge: OscBridge, url = DEFAULT_BRIDGE_URL): Promise<void> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error(`dev bridge unreachable: ${url}`));
  });
  const transport: OscTransport = {
    connected: true,
    send(bytes) {
      if (ws.readyState === WebSocket.OPEN) ws.send(bytes);
    },
    connect() { /* opened by constructor */ },
    dispose() { ws.close(); },
    onReceived(cb) {
      ws.onmessage = async (e) => {
        const raw = e.data as ArrayBuffer | Blob;
        const data = raw instanceof Blob ? new Uint8Array(await raw.arrayBuffer()) : new Uint8Array(raw);
        const msg = decodeOscMessage(data);
        if (msg) cb(msg);
      };
    },
  };
  bridge.attach(transport);
}