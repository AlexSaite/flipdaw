import { useEffect, useRef, useState } from 'react';
import { useTransport } from '../../store/transport';
import { useGrid } from '../../store/project';
import { useSettings } from '../../store/settings';
import { useUi, type LayoutMode } from '../../store/ui';
import { getEngine } from '../../audio/engine';
import { BPM_MIN, BPM_MAX, type Quantize } from '../../audio/transport';

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

  useEffect(() => () => {
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
  }, []);

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
      <button className="transport__play" onClick={togglePlay} title={playing ? 'Pause (pads keep playing in place)' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <button className="transport__stop" onClick={stopAll} title="Stop all clips">■</button>
      <label className="transport__bpm">
        BPM
        <input type="range" min={BPM_MIN} max={BPM_MAX} value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))} />
        <span className="transport__val">{bpm}</span>
      </label>
      <button className={`btn transport__tap${tapFlash ? ' is-on' : ''}`} onClick={onTapTempo} title="Tap tempo: tap on the beat 2–5 times to set BPM">TAP</button>
      <button className={`btn transport__record${recordState !== 'idle' ? ' is-on' : ''}`} onClick={onRecord} title="Record loop">
        ●{recordState !== 'idle' && ` ${recordState}`}
      </button>
      <button className={`btn transport__metro${metroEnabled ? ' is-on' : ''}`} onClick={toggleMetro}>
        M
      </button>
      <label className="transport__q">
        Q
        <select value={quantize} onChange={(e) => setQuantize(e.target.value as Quantize)}>
          {Q.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
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