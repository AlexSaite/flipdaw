import { useGrid, cellId } from '../../store/project';
import { Cell } from './Cell';

export function Grid() {
  const tracks = useGrid((s) => s.tracks);
  const scenes = useGrid((s) => s.sceneCount);
  return (
    <div className="grid">
      {tracks.map((t) => (
        <div key={t.id} className="grid__col">
          <div className="grid__head" style={{ background: t.color }}>{t.name}</div>
          {Array.from({ length: scenes }, (_, sc) => (
            <Cell key={sc} id={cellId(t.id, sc)} color={t.color} />
          ))}
        </div>
      ))}
    </div>
  );
}
