import { useUi, type DeckKey } from '../../store/ui';
import { DECK_META, deckMeta } from './meta';
import { DeckModule } from './modules';
import { Nameplate } from '../components/Nameplate';

const onPadKey = (e: React.KeyboardEvent, fn: () => void): void => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
};

/** Canvas phase 1: the whole studio is a grid of drum pads — one live
 *  miniature per module (real skins, LEDs, meters). Tap once to go to
 *  previewPro. */
export function PadsGrid() {
  const openPreview = useUi((s) => s.openPreview);
  const preview = useUi((s) => s.preview);
  return (
    <div className="pads" role="group" aria-label="Module pads">
      {DECK_META.map((m) => (
        <div
          key={m.key}
          role="button"
          tabIndex={0}
          className={`pads-card${preview.includes(m.key) ? ' is-active' : ''}`}
          onClick={() => openPreview(m.key)}
          onKeyDown={(e) => onPadKey(e, () => openPreview(m.key))}
          title={`${m.title} · tap to preview`}
        >
          <span className="pads-card__mini pads-mini" aria-hidden="true">
            <span className="miniplay"><DeckModule d={m.key} /></span>
          </span>
          <span className="pads-card__label">
            {m.label}
            <em className="pads-card__model">{m.model}</em>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Canvas phase 2 (previewPro): 1..2 interactive module panes. With a single
 *  pane the other half is a big translucent "+" that can stage a second
 *  module; each pane can expand to fullscreen or close back to the pads. */
export function PreviewStage() {
  const preview = useUi((s) => s.preview);
  return (
    <div className="pre" role="group" aria-label="Preview stage">
      {preview.map((d) => <PreviewPane key={d} deck={d} />)}
      {preview.length < 2 && <AddPane />}
    </div>
  );
}

function PreviewPane({ deck }: { deck: DeckKey }) {
  const expand = useUi((s) => s.expand);
  const close = useUi((s) => s.closePreview);
  const meta = deckMeta(deck);
  return (
    <section className="pre__pane pane" aria-label={meta.title}>
      <header className="pane__head">
        <Nameplate model={meta.model} name={meta.name} />
        <span className="pane__meta">{meta.label}</span>
        <span className="pane__spacer" />
        <button className="pane__ctl" onClick={() => expand(deck)} title="Expand to fullscreen (full access)">⛶</button>
        <button className="pane__ctl pane__ctl--close" onClick={close} title="Close and go back to the pads">✕</button>
      </header>
      <div className="pane__body">
        <DeckModule d={deck} />
      </div>
    </section>
  );
}

/** The right half of a single-module previewPro: a big "+" overlaying the
 *  empty half with a soft shadow. Tap it to open the add-picker, then pick a
 *  second module — both panes become interactive. */
function AddPane() {
  const picking = useUi((s) => s.picking);
  const togglePicker = useUi((s) => s.togglePicker);
  const addModule = useUi((s) => s.addModule);
  const preview = useUi((s) => s.preview);
  const others = DECK_META.filter((m) => !preview.includes(m.key));
  return (
    <section className={`pre__add${picking ? ' is-picking' : ''}`} aria-label="Add a second module">
      <button
        className="pre__plus"
        onClick={togglePicker}
        title={picking ? 'Cancel adding' : 'Add a second module'}
      >
        {picking ? '✕' : '+'}
      </button>
      {picking && (
        <div className="pre__picker" role="group" aria-label="Pick a second module">
          {others.map((m) => (
            <div
              key={m.key}
              role="button"
              tabIndex={0}
              className="pads-card pads-card--small"
              onClick={() => addModule(m.key)}
              onKeyDown={(e) => onPadKey(e, () => addModule(m.key))}
              title={m.title}
            >
              <span className="pads-card__mini pads-mini" aria-hidden="true">
                <span className="miniplay"><DeckModule d={m.key} /></span>
              </span>
              <span className="pads-card__label">
                {m.label}
                <em className="pads-card__model">{m.model}</em>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Canvas phase 3: a single module expanded to the whole canvas with full
 *  functionality still reachable (← back restores the previewPro panes). */
export function FullStage() {
  const fulldeck = useUi((s) => s.fulldeck);
  const exitFull = useUi((s) => s.exitFull);
  if (!fulldeck) return null;
  const meta = deckMeta(fulldeck);
  return (
    <section className="full pane" aria-label={meta.title}>
      <header className="pane__head">
        <button className="pane__ctl" onClick={exitFull} title="Back to the preview stage">←</button>
        <Nameplate model={meta.model} name={meta.name} />
        <span className="pane__meta">{meta.label} · fullscreen</span>
        <span className="pane__spacer" />
      </header>
      <div className="full__body">
        <DeckModule d={fulldeck} />
      </div>
    </section>
  );
}