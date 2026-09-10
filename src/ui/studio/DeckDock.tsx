import { useUi } from '../../store/ui';
import { DECK_META } from './meta';
import { DeckModule } from './modules';

/**
 * Module wall (UI-REDESIGN §3, user-driven redesign): every instrument deck
 * is shown as a live *miniature of the real module page* — same skins, same
 * LEDs, same meters, same layout — scaled down. Tap a card to open that
 * module in the stage; tapping again focuses it. 0..N modules can be open
 * at once, so the grid stays usable while a synth is layered beside it.
 */
export function DeckDock() {
  const open = useUi((s) => s.open);
  const focused = useUi((s) => s.focused);
  const toggleOpen = useUi((s) => s.toggleOpen);

  const onKey = (e: React.KeyboardEvent, d: typeof DECK_META[number]['key']): void => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(d); }
  };

  return (
    <nav className="deckdock" role="tablist" aria-label="Module wall">
      {DECK_META.map((d) => {
        const isOpen = open.includes(d.key);
        return (
          <div
            key={d.key}
            role="tab"
            tabIndex={0}
            aria-selected={isOpen}
            className={`deckdock__card${isOpen ? ' is-open' : ''}${focused === d.key ? ' is-focused' : ''}`}
            onClick={() => toggleOpen(d.key)}
            onKeyDown={(e) => onKey(e, d.key)}
            title={`${d.title} · tap to ${isOpen ? 'focus' : 'open'}`}
          >
            <span className="deckdock__mini" aria-hidden="true">
              <span className="miniplay"><DeckModule d={d.key} /></span>
            </span>
            <span className="deckdock__label">
              {d.label}
              <em className="deckdock__model">{d.model}</em>
            </span>
          </div>
        );
      })}
    </nav>
  );
}