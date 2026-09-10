import { useGrid } from '../../store/project';
import { Fader } from './Fader';
import { Meter } from './Meter';

/** One vertical strip per track (fader, pan, M/S, meter). Shared by the Mixer
 *  layout and the translucent studio overlay (UI-REDESIGN §4). */
export function MixerStrips() {
  const tracks = useGrid((s) => s.tracks);
  const setGain = useGrid((s) => s.setTrackGain);
  const setPan = useGrid((s) => s.setTrackPan);
  const setMute = useGrid((s) => s.setTrackMute);
  const setSolo = useGrid((s) => s.setTrackSolo);

  return (
    <>
      {tracks.map((t) => (
        <div key={t.id} className="mixer__strip" style={{ '--c': t.color } as React.CSSProperties}>
          <div className="mixer__head">{t.name}</div>
          <Meter trackId={t.id} vertical />
          <Fader orientation="vertical" value={t.gain} onChange={(v) => setGain(t.id, v)} label="vol" />
          <Fader orientation="vertical" value={(t.pan + 1) / 2} onChange={(v) => setPan(t.id, v * 2 - 1)} label="pan" />
          <div className="mixer__btns">
            <button className={`btn btn--toggle mixer__ms${t.muted ? ' is-on' : ''}`}
              onClick={() => setMute(t.id, !t.muted)}>M</button>
            <button className={`btn btn--toggle mixer__ms${t.solo ? ' is-on' : ''}`}
              onClick={() => setSolo(t.id, !t.solo)}>S</button>
          </div>
        </div>
      ))}
    </>
  );
}