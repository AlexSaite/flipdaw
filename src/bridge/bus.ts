export type LayoutMode = 'laptop' | 'tent' | 'mixer';

export interface OscArg {
  type: OscArgType;
  value: number | string;
}

export type OscArgType = 'i' | 'f' | 's';

export interface OscMessage {
  address: string;
  args: OscArg[];
}

export type MidiChannelMessage =
  | { kind: 'noteOn'; note: number; velocity: number }
  | { kind: 'noteOff'; note: number }
  | { kind: 'cc'; cc: number; value: number }
  | { kind: 'clock' }
  | { kind: 'start' }
  | { kind: 'stop' }
  | { kind: 'continue' };

export interface BridgeEventMap {
  osc: { kind: 'osc'; message: OscMessage };
  oscAction: { kind: 'oscAction'; action: string; args: number[] };
  midi: { kind: 'midi'; message: MidiChannelMessage };
  hinge: { kind: 'hinge'; angle: number };
}

export type BridgeEventKind = keyof BridgeEventMap;
export type BridgeEvent = BridgeEventMap[BridgeEventKind];

export type BridgeListener<K extends BridgeEventKind = BridgeEventKind> =
  (e: BridgeEventMap[K]) => void;

export type BridgeUnsub = () => void;

export interface BridgeBus {
  readonly on: <K extends BridgeEventKind>(kind: K, cb: BridgeListener<K>) => BridgeUnsub;
  readonly emit: (e: BridgeEvent) => void;
}

export function createBridgeBus(): BridgeBus {
  const listeners = new Map<BridgeEventKind, Set<(e: BridgeEvent) => void>>();
  return {
    on(kind, cb) {
      let set = listeners.get(kind);
      if (!set) { set = new Set(); listeners.set(kind, set); }
      set.add(cb as (e: BridgeEvent) => void);
      return () => { set!.delete(cb as (e: BridgeEvent) => void); };
    },
    emit(e) {
      listeners.get(e.kind)?.forEach((cb) => cb(e));
    },
  };
}

/** Shared app-wide bridge hub. */
export const bridgeBus = createBridgeBus();