import { useGrid, cellId } from '../../store/project';
import { useTransport } from '../../store/transport';
import { Cell } from './Cell';

export function Grid() {
  const tracks = useGrid((s) => s.tracks);
  const scenes = useGrid((s) => s.sceneCount);
  return (
    <div className="grid skin-launchpad">
      <div className="grid__board">
        {tracks.map((t) => (
          <div key={t.id} className="grid__col">
            <div className="grid__head" style={{ color: t.color, borderColor: t.color }}>{t.name}</div>
            {Array.from({ length: scenes }, (_, sc) => (
              <Cell key={sc} id={cellId(t.id, sc)} color={t.color} />
            ))}
          </div>
        ))}
      </div>
      <div className="grid__action">
        <button className="grid__panic" onClick={() => useTransport.getState().stopAll()} title="Stop everything">
          ⏹ All
        </button>
        <span className="grid__meta">{tracks.length} trk · {scenes} scn</span>
      </div>
    </div>
  );
}