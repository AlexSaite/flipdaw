import { useUi } from '../../store/ui';
import { ProjectBar } from '../components/ProjectBar';
import { TransportBar } from '../components/TransportBar';
import { Toasts } from '../components/Toasts';
import { PadsGrid, PreviewStage, FullStage } from '../studio/canvas';
import { BackdropOverlay } from '../studio/BackdropOverlay';
import { MixerPanel } from '../studio/panels';

/**
 * Portable music station (UI-REDESIGN §3, user-driven redesign):
 * persistent ProjectBar + TransportBar. The whole canvas is a grid of drum
 * pads, one live miniature per module. Tap a pad → previewPro: the module
 * fills the left half, the right half is a big "+" add zone. From previewPro
 * three actions are available — close (back to pads), tap "+" to stage a
 * second interactive module, or expand a pane to fullscreen. Secondaries
 * (mixer) open as translucent overlays (UI-REDESIGN §4).
 */
export function StudioLayout() {
  const view = useUi((s) => s.view);
  const overlay = useUi((s) => s.overlay);
  const setOverlay = useUi((s) => s.setOverlay);

  return (
    <div className="studio">
      <ProjectBar />
      <TransportBar />
      <div className="studio__body">
        {view === 'pads' && <PadsGrid />}
        {view === 'preview' && <PreviewStage />}
        {view === 'full' && <FullStage />}
      </div>
      <nav className="studio__footer">
        <button
          className={`btn${overlay === 'mixer' ? ' is-on' : ''}`}
          onClick={() => setOverlay(overlay === 'mixer' ? null : 'mixer')}
        >
          Mixer
        </button>
      </nav>
      {overlay === 'mixer' && (
        <BackdropOverlay onClose={() => setOverlay(null)}>
          <MixerPanel />
        </BackdropOverlay>
      )}
      <Toasts />
    </div>
  );
}