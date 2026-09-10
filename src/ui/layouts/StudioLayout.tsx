import { useUi } from '../../store/ui';
import { ProjectBar } from '../components/ProjectBar';
import { TransportBar } from '../components/TransportBar';
import { Toasts } from '../components/Toasts';
import { Nameplate } from '../components/Nameplate';
import { DeckDock } from '../studio/DeckDock';
import { BackdropOverlay } from '../studio/BackdropOverlay';
import { MixerPanel, MasterPanel } from '../studio/panels';
import { DeckModule } from '../studio/modules';
import { deckMeta } from '../studio/meta';
import type { DeckKey } from '../../store/ui';

/**
 * Portable music station (UI-REDESIGN §3 + module-wall redesign):
 * persistent ProjectBar + TransportBar, a *wall* of live module miniatures
 * on top, and below it the stage — zero or more simultaneously open modules
 * as tiled windows (focus / expand / close). 2–3 modules can run at once,
 * e.g. the clip grid stays live while keys are layered beside it. Secondary
 * controls (mixer/master) open as translucent overlays (§4).
 */
export function StudioLayout() {
  const open = useUi((s) => s.open);
  const overlay = useUi((s) => s.overlay);
  const setOverlay = useUi((s) => s.setOverlay);

  return (
    <div className="studio">
      <ProjectBar />
      <TransportBar />
      <div className="studio__body">
        <DeckDock />
        <main className="studio__stage" aria-label="Studio stage">
          {open.map((key) => (
            <StageTile key={key} deck={key} />
          ))}
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

function StageTile({ deck }: { deck: DeckKey }) {
  const openCount = useUi((s) => s.open.length);
  const focused = useUi((s) => s.focused === deck);
  const focus = useUi((s) => s.focus);
  const solo = useUi((s) => s.solo);
  const closeTile = useUi((s) => s.closeTile);
  const meta = deckMeta(deck);

  return (
    <section
      className={`stage-tile${focused ? ' is-focused' : ''}`}
      style={{ flexBasis: `${100 / Math.max(1, openCount)}%` }}
      aria-label={meta.title}
    >
      <header className="stage-tile__head">
        <Nameplate model={meta.model} name={meta.name} />
        <span className="stage-tile__meta">{meta.label}</span>
        <span className="stage-tile__spacer" />
        <button className="stage-tile__ctl" onClick={() => focus(deck)} title="Focus">◎</button>
        <button className="stage-tile__ctl" onClick={() => solo(deck)} title="Expand to full stage">⛶</button>
        <button
          className="stage-tile__ctl stage-tile__ctl--close"
          onClick={() => closeTile(deck)}
          title="Close back to wall"
        >
          ✕
        </button>
      </header>
      <div className="stage-tile__body">
        <DeckModule d={deck} />
      </div>
    </section>
  );
}