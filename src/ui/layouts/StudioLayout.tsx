import { useEffect } from 'react';
import { useUi } from '../../store/ui';
import { useGrid } from '../../store/project';
import { ProjectBar } from '../components/ProjectBar';
import { TransportBar } from '../components/TransportBar';
import { StepSequencer } from '../components/StepSequencer';
import { Piano } from '../components/Piano';
import { Sampler } from '../components/Sampler';
import { DJDeck } from '../components/DJDeck';
import { Turntable } from '../components/Turntable';
import { Grid } from '../components/Grid';
import { Inspector } from '../components/Inspector';
import { Toasts } from '../components/Toasts';
import { DeckDock } from '../studio/DeckDock';
import { BackdropOverlay } from '../studio/BackdropOverlay';
import { MixerPanel, MasterPanel } from '../studio/panels';

/**
 * Portable music station (UI-REDESIGN §3): persistent ProjectBar + TransportBar,
 * a deck dock of live previews on top, and exactly one expanded instrument deck
 * in the workspace. Secondary controls (mixer/master) open as translucent
 * overlays (§4) instead of pushing the layout. The old LaptopLayout remains as
 * the 'laptop' mode ("Classic").
 */
export function StudioLayout() {
  const activeDeck = useUi((s) => s.activeDeck);
  const setActiveDeck = useUi((s) => s.setActiveDeck);
  const overlay = useUi((s) => s.overlay);
  const setOverlay = useUi((s) => s.setOverlay);
  const ready = useGrid((s) => s.ready);
  const init = useGrid((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="studio">
      <ProjectBar />
      <TransportBar />
      <div className="studio__body">
        <DeckDock />
        <main className="studio__workspace">
          <header className="studio__deckhead">
            <span className="studio__decklabel">{activeDeck}</span>
            <button className="btn btn--sm" onClick={() => setActiveDeck('grid')} title="Collapse: back to the clip grid">
              ⋏ Grid
            </button>
          </header>
          <div className="studio__deckbody">
            {activeDeck === 'grid' &&
              (ready ? (
                <div className="studio__gridwrap">
                  <div className="studio__gridleft">
                    <Grid />
                  </div>
                  <Inspector />
                </div>
              ) : (
                <div className="laptop__loading">Loading demo…</div>
              ))}
            {activeDeck === 'drum' && <StepSequencer />}
            {activeDeck === 'piano' && <Piano />}
            {activeDeck === 'sampler' && <Sampler />}
            {activeDeck === 'dj' && <DJDeck />}
            {activeDeck === 'tt' && <Turntable />}
          </div>
        </main>
      </div>
      <nav className="studio__footer">
        <button
          className={`btn${overlay === 'mixer' ? ' is-on' : ''}`}
          onClick={() => setOverlay(overlay === 'mixer' ? null : 'mixer')}
        >
          Mixer
        </button>
        <button
          className={`btn${overlay === 'master' ? ' is-on' : ''}`}
          onClick={() => setOverlay(overlay === 'master' ? null : 'master')}
        >
          Master
        </button>
      </nav>
      {overlay === 'mixer' && (
        <BackdropOverlay onClose={() => setOverlay(null)}>
          <MixerPanel />
        </BackdropOverlay>
      )}
      {overlay === 'master' && (
        <BackdropOverlay onClose={() => setOverlay(null)}>
          <MasterPanel />
        </BackdropOverlay>
      )}
      <Toasts />
    </div>
  );
}