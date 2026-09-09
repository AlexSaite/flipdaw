import { useEffect, useRef, useState } from 'react';
import { useTransport } from '../../store/transport';
import { useGrid } from '../../store/project';
import { useSettings } from '../../store/settings';
import { useUi, type LayoutMode } from '../../store/ui';
import { getEngine } from '../../audio/engine';
import type { Quantize } from '../../audio/transport';

const Q: Quantize[] = ['off', '1/4', '1/2', '1bar', '2bar'];
const MODES: LayoutMode[] = ['laptop', 'tent', 'mixer'];

export function TransportBar() {
  const playing = useTransport((s) => s.playing);
  const bpm = useTransport((s) => s.bpm);
  const togglePlay = useTransport((s) => s.togglePlay);
  const stopAll = useTransport((s) => s.stopAll);
  const setBpm = useTransport((s) => s.setBpm);
  const quantize = useGrid((s) => s.quantize);
  const setQuantize = useGrid((s) => s.setQuantize);
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const setMappingOpen = useUi((s) => s.setMappingOpen);
  const metroEnabled = useSettings((s) => s.metroEnabled);
  const set = useSettings((s) => s.set);
  const recordState = useGrid((s) => s.recordState);
  const startRecording = useGrid((s) => s.startRecording);
  const stopRecording = useGrid((s) => s.stopRecording);
  const [tapFlash, setTapFlash] = useState(false);
  const tapTimer = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  useEffect(() => () => {
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
  }, []);

  const step = (dir: number): void => {
    useTransport.getState().setBpm(useTransport.getState().bpm + dir);
  };

  /** Single tap = 1 step; press+hold = smooth repeat after 320 ms. */
  const startHold = (dir: number): void => {
    stopHold();
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      step(dir);
      holdTimer.current = window.setInterval(() => step(dir), 95);
    }, 320);
  };
  const stopHold = (): void => {
    if (holdTimer.current !== null) { window.clearInterval(holdTimer.current); holdTimer.current = null; }
  };
  const onStepClick = (dir: number): void => {
    if (heldRef.current) { heldRef.current = false; return; } // release of a long press
    step(dir);
  };

  const onRecord = (): void => {
    if (recordState === 'idle') void startRecording();
    else stopRecording();
  };

  const onTapTempo = (): void => {
    const e = getEngine();
    const b = e.tapTempo.tap(e.ctx.currentTime);
    if (b) setBpm(b);
    setTapFlash(true);
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => setTapFlash(false), 220);
  };

  const toggleMetro = (): void => {
    const on = !useSettings.getState().metroEnabled;
    set({ metroEnabled: on });
    getEngine().metronome.setEnabled(on);
  };

  return (
    <header className="transport">
      <label className="transport__playlabel">
        <button className="transport__play" onClick={togglePlay} title={playing ? 'Pause (pads keep playing in place)' : 'Play'}>
          {playing ? '⏸' : '▶'}
        </button>
      </label>
      <button className="transport__stop" onClick={stopAll} title="Stop all clips">■</button>
      <div className="transport__bpm">
        <span className="transport__bpm-label">BPM</span>
        <button className="transport__step"
          onPointerDown={(e) => { e.preventDefault(); startHold(-1); }}
          onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => onStepClick(-1)} title="Slower">−</button>
        <span className="transport__val transport__val--big">{bpm}</span>
        <button className="transport__step"
          onPointerDown={(e) => { e.preventDefault(); startHold(1); }}
          onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => onStepClick(1)} title="Faster">+</button>
      </div>
      <button className={`btn transport__tap${tapFlash ? ' is-on' : ''}`} onClick={onTapTempo} title="Tap tempo: tap on the beat 2–5 times to set BPM">TAP</button>
      <button className={`btn transport__record${recordState !== 'idle' ? ' is-on' : ''}`} onClick={onRecord} title="Record loop">
        ●{recordState !== 'idle' && ` ${recordState}`}
      </button>
      <button className={`btn transport__metro${metroEnabled ? ' is-on' : ''}`} onClick={toggleMetro}>
        M
      </button>
      <div className="transport__q">
        <span className="transport__q-label">Q</span>
        <div className="seg seg--wrap">
          {Q.map((q) => (
            <button key={q} className={`seg-btn${quantize === q ? ' is-on' : ''}`}
              onClick={() => setQuantize(q)} title={`Quantize: ${q}`}>{q}</button>
          ))}
        </div>
      </div>
      <div className="transport__right">
        {MODES.map((m) => (
          <button key={m} className={`btn transport__mode${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>
            {m}
          </button>
        ))}
        <button className="btn transport__gear" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        <button className="btn transport__link" onClick={() => setMappingOpen(true)} title="OSC/MIDI">⇄</button>
      </div>
    </header>
  );
}