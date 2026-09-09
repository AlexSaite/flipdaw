import { useEffect } from 'react';
import { Grid } from '../components/Grid';
import { TransportBar } from '../components/TransportBar';
import { useGrid } from '../../store/project';
import { getEngine } from '../../audio/engine';

export function LaptopLayout() {
  const ready = useGrid((s) => s.ready);
  const init = useGrid((s) => s.init);

  useEffect(() => {
    getEngine().resume();   // autoplay policy: user gesture is the play button
    void init();
  }, [init]);

  return (
    <div className="laptop">
      <TransportBar />
      <main className="laptop__main">
        {ready ? <Grid /> : <div className="laptop__loading">Loading demo…</div>}
      </main>
    </div>
  );
}
