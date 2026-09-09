import { useEffect } from 'react';
import { Grid } from '../components/Grid';
import { TransportBar } from '../components/TransportBar';
import { StepSequencer } from '../components/StepSequencer';
import { Piano } from '../components/Piano';
import { Inspector } from '../components/Inspector';
import { ProjectBar } from '../components/ProjectBar';
import { Toasts } from '../components/Toasts';
import { useGrid } from '../../store/project';

export function LaptopLayout() {
  const ready = useGrid((s) => s.ready);
  const init = useGrid((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="laptop">
      <ProjectBar />
      <TransportBar />
      <StepSequencer />
      <Piano />
      <main className="laptop__main">
        <div className="laptop__left">
          {ready ? <Grid /> : <div className="laptop__loading">Loading demo…</div>}
        </div>
        <Inspector />
      </main>
      <Toasts />
    </div>
  );
}
