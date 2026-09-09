import { bridgeBus } from './bus';
import { getOscBridge } from './oscBridge';
import { HingeSensor, angleToModeHysteresis } from './hinge';
import { MidiClockOut, ClockInput, encodeRealtime, cellFromNote, trackFromCc } from './midi';
import type { BridgeUnsub, MidiChannelMessage } from './bus';
import { getEngine } from '../audio/engine';
import { cellId, useGrid } from '../store/project';
import { useTransport } from '../store/transport';
import { useUi } from '../store/ui';
import { toast } from '../store/toasts';

let hinge: HingeSensor | null = null;
let clockOut: MidiClockOut | null = null;
let clockIn = new ClockInput();
let clockInTicks = 0;

const noteBindings = new Map<number, string>();
const learnWaiters: Array<(note: number) => void> = [];

export function getHinge(): HingeSensor {
  hinge ??= new HingeSensor();
  return hinge;
}

/** Arm MIDI-learn: resolves on the next incoming MIDI note (with timeout). */
export function learnNextMidiNote(timeoutMs = 15000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const i = learnWaiters.indexOf(done);
      if (i >= 0) learnWaiters.splice(i, 1);
      reject(new Error('MIDI learn timed out'));
    }, timeoutMs);
    const done = (note: number): void => {
      window.clearTimeout(timer);
      resolve(note);
    };
    learnWaiters.push(done);
  });
}

/** Bind a pad note to a grid cell (overrides default row/col mapping). */
export function bindNoteToCell(note: number, id: string): void {
  noteBindings.set(note, id);
  toast.info(`Note ${note} → ${id}`);
}

function routeMidi(msg: MidiChannelMessage): void {
  if (msg.kind === 'clock' || msg.kind === 'start' || msg.kind === 'continue' || msg.kind === 'stop') {
    if (msg.kind !== 'clock') clockIn.reset();
    if (msg.kind === 'clock') {
      const e = getEngine();
      clockInTicks++;
      clockIn.tick(e.ctx.currentTime);
      if (clockInTicks % 48 === 0) {
        const bpm = Math.round(clockIn.bpm());
        const current = e.transport.bpm;
        if (current !== bpm) e.transport.setBpm(bpm);
      }
    }
    return;
  }
  if (msg.kind === 'cc') {
    const idx = trackFromCc(msg.cc);
    const track = idx === null ? undefined : useGrid.getState().tracks[idx];
    if (track) {
      useGrid.getState().setTrackGain(track.id, msg.value / 127);
      return;
    }
  }
  if (msg.kind === 'noteOn' && msg.velocity > 0) {
    const bound = noteBindings.get(msg.note);
    if (bound) { useGrid.getState().tap(bound); return; }
    const cell = cellFromNote(msg.note);
    if (!cell) return;
    const track = useGrid.getState().tracks[cell.trackIdx];
    if (track) useGrid.getState().tap(cellId(track.id, cell.scene));
    return;
  }
  if (msg.kind === 'noteOff') {
    const bound = noteBindings.get(msg.note);
    if (bound) {
      const p = useGrid.getState().players[bound];
      p?.panic();
    }
  }
}

function routeOscAction(action: string): void {
  const m = /^Scene (\d+)$/.exec(action);
  if (m) {
    useGrid.getState().launchScene(Number(m[1]) - 1);
    return;
  }
  if (action === 'Play') useTransport.getState().togglePlay();
  else if (action === 'Stop') {
    const e = getEngine();
    e.panic();
  }
}

function ensureClockOut(): MidiClockOut {
  if (clockOut) return clockOut;
  const e = getEngine();
  clockOut = new MidiClockOut(
    { at: (sec, fn) => e.scheduler.at(sec, fn) },
    { now: () => e.ctx.currentTime, bpm: () => e.transport.bpm },
    () => sendMidi(encodeRealtime('clock')),
    () => sendMidi(encodeRealtime('start')),
    () => sendMidi(encodeRealtime('stop')),
  );
  return clockOut;
}

function sendMidi(bytes: Uint8Array<ArrayBuffer>): void {
  const bridge = getOscBridge();
  if (bridge.transport) bridge.transport.send(bytes); // binary over dev-bridge WS
}

function onTransportChange(playing: boolean): void {
  if (!useUi.getState().midiSync) {
    if (clockOut) clockOut.stop();
    return;
  }
  if (playing) ensureClockOut().start();
  else ensureClockOut().stop();
}

/** Subscribe the whole bridge to the app. Returns an unsubscribe function. */
export function bindBridge(): BridgeUnsub {
  const e = getEngine();
  const unsubs: BridgeUnsub[] = [
    bridgeBus.on('oscAction', (ev) => routeOscAction(ev.action)),
    bridgeBus.on('midi', (ev) => {
      routeMidi(ev.message);
      if (ev.message.kind === 'noteOn') {
        for (const done of [...learnWaiters]) {
          learnWaiters.splice(0);
          done(ev.message.note);
        }
      }
    }),
    bridgeBus.on('hinge', (ev) => {
      const prev = useUi.getState().mode;
      const next = angleToModeHysteresis(ev.angle, prev);
      useUi.getState().setMode(next);
      useUi.getState().setHinge(ev.angle);
    }),
    e.transport.subscribe((s) => onTransportChange(s.playing)),
  ];
  getHinge().start();
  toast.info('Bridge armed (OSC + MIDI + hinge)');
  return () => {
    unsubs.forEach((u) => u());
    getHinge().stop();
    clockOut?.stop();
  };
}