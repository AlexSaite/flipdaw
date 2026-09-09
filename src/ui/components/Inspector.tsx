import { useRef } from 'react';
import { useGrid } from '../../store/project';
import { useTransport } from '../../store/transport';
import type { FollowAction } from '../../audio/follow';
import { WaveThumb } from './WaveThumb';
import { Meter } from './Meter';

const FOLLOW_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Off' },
  { value: 'next', label: 'Next scene' },
  { value: 'stop', label: 'Stop all' },
  { value: '2', label: 'After 2 bars → next' },
];

/** Right-side inspector: shows the selected clip + its track's mixing. */
export function Inspector() {
  const selected = useGrid((s) => s.selected);
  const cell = useGrid((s) => (selected ? s.cells[selected] : undefined));
  const tracks = useGrid((s) => s.tracks);
  const importFile = useGrid((s) => s.importFile);
  const setGain = useGrid((s) => s.setTrackGain);
  const setPan = useGrid((s) => s.setTrackPan);
  const setMute = useGrid((s) => s.setTrackMute);
  const setSolo = useGrid((s) => s.setTrackSolo);
  const follows = useGrid((s) => s.follows);
  const setFollowAction = useGrid((s) => s.setFollowAction);
  const reverbLevel = useGrid((s) => s.reverbLevel);
  const setReverbLevel = useGrid((s) => s.setReverbLevel);
  const bpm = useTransport((s) => s.bpm);
  const fileRef = useRef<HTMLInputElement>(null);

  const track = cell ? tracks.find((t) => t.id === cell.trackId) : undefined;

  if (!cell || !track) {
    return (
      <aside className="inspector">
        <div className="inspector__empty">
          <p>Tap a cell to inspect it,<br />or import a sample.</p>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import WAV</button>
          <input ref={fileRef} type="file" accept=".wav,audio/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.currentTarget.value = ''; }} />
        </div>
      </aside>
    );
  }

  const clip = cell.clip;
  const secs = clip && clip.type === 'loop'
    ? (clip.lengthBeats * (60 / bpm)) / 4
    : (clip ? (clip.lengthBeats * (60 / bpm)) : 0);

  const follow = follows[cell.scene];
  const followValue = follow?.type === 'afterBars' ? String(follow.bars) : follow?.type ?? '';

  return (
    <aside className="inspector">
      <div className="inspector__track" style={{ background: track.color }}>
        {track.name}
      </div>

      <section className="inspector__clip">
        <h4>Clip · scene {cell.scene + 1}</h4>
        <WaveThumb cellId={cell.id} color={track.color} />
        {clip ? (
          <dl className="inspector__dl">
            <dt>File</dt><dd>{clip.file ? clip.file.replace('samples/', '') : '(recorded, unsaved)'}</dd>
            <dt>Type</dt><dd>{clip.type}</dd>
            <dt>Length</dt><dd>{condense(secs)}s</dd>
          </dl>
        ) : (
          <p className="inspector__muted">No clip in this slot.</p>
        )}
        <button className="btn" onClick={() => fileRef.current?.click()}>Import WAV here</button>
        <input ref={fileRef} type="file" accept=".wav,audio/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.currentTarget.value = ''; }} />
      </section>

      <section className="inspector__follow">
        <h4>Follow-action (scene {cell.scene + 1})</h4>
        <select value={followValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') setFollowAction(cell.scene, null);
            else if (v === 'next') setFollowAction(cell.scene, { type: 'next' });
            else if (v === 'stop') setFollowAction(cell.scene, { type: 'stop' });
            else setFollowAction(cell.scene, { type: 'afterBars', bars: Number(v) });
          }}>
          {FOLLOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="inspector__muted">{follow ? describe(follow) : 'No follow-action.'}</p>
      </section>

      <section className="inspector__mix">
        <h4>Track</h4>
        <div className="row">
          <label>Gain</label>
          <input type="range" min={0} max={1} step={0.01} value={track.gain}
            onChange={(e) => setGain(track.id, Number(e.target.value))} />
          <span>{Math.round(track.gain * 100)}%</span>
        </div>
        <div className="row">
          <label>Pan</label>
          <input type="range" min={-1} max={1} step={0.01} value={track.pan}
            onChange={(e) => setPan(track.id, Number(e.target.value))} />
          <span>{track.pan > 0 ? `${Math.round(track.pan * 100)}R` : track.pan < 0 ? `${Math.round(-track.pan * 100)}L` : 'C'}</span>
        </div>
        <div className="row row--btns">
          <button className={`btn btn--toggle${track.muted ? ' is-on' : ''}`} onClick={() => setMute(track.id, !track.muted)}>M</button>
          <button className={`btn btn--toggle${track.solo ? ' is-on' : ''}`} onClick={() => setSolo(track.id, !track.solo)}>S</button>
        </div>
        <div className="row">
          <label>Reverb</label>
          <input type="range" min={0} max={1} step={0.01} value={reverbLevel}
            onChange={(e) => setReverbLevel(Number(e.target.value))} />
          <span>{Math.round(reverbLevel * 100)}%</span>
        </div>
      </section>

      <section className="inspector__meter">
        <h4>Level</h4>
        <Meter trackId={track.id} />
      </section>
    </aside>
  );
}

function describe(a: FollowAction): string {
  switch (a.type) {
    case 'next': return 'Play next scene after 1 bar.';
    case 'stop': return 'Stop everything after 1 bar.';
    case 'afterBars': return `Jump to next scene after ${a.bars} bars.`;
  }
}

function condense(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return '…';
  return secs < 10 ? secs.toFixed(2) : secs.toFixed(1);
}
