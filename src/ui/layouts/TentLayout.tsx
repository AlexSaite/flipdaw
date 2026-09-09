import { useEffect } from 'react';
import { useGrid, cellId } from '../../store/project';
import { Cell } from '../components/Cell';
import { useSettings } from '../../store/settings';
import { getEngine } from '../../audio/engine';

/** Tent mode: 3×3 big pads, ≥96px, kiosk-feel (no inspector). */
export function TentLayout() {
  const tracks = useGrid((s) => s.tracks);
  const sceneCount = useGrid((s) => s.sceneCount);
  const ready = useGrid((s) => s.ready);
  const init = useGrid((s) => s.init);
  const metroEnabled = useSettings((s) => s.metroEnabled);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    getEngine().metronome.setEnabled(metroEnabled);
  }, [metroEnabled]);

  const cols = tracks.slice(0, 3);
  const scenes = Math.min(sceneCount, 3);

  return (
    <div className="tent">
      {!ready ? (
        <div className="laptop__loading">Loading demo…</div>
      ) : (
        <div className="tent__grid">
          {cols.map((t) => (
            <div key={t.id} className="tent__col">
              {Array.from({ length: scenes }, (_, sc) => (
                <Cell key={sc} id={cellId(t.id, sc)} color={t.color} big />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}