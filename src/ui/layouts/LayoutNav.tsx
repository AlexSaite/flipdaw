import { useUi, type LayoutMode } from '../../store/ui';

const MODES: LayoutMode[] = ['laptop', 'tent', 'mixer'];

/** Slim always-available layout switcher — lets the user leave tent/mixer. */
export function LayoutNav() {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  return (
    <div className="layout-nav">
      {MODES.map((m) => (
        <button key={m} className={`btn transport__mode${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>
          {m}
        </button>
      ))}
      <span className="layout-nav__hint">keys 1/2/3</span>
    </div>
  );
}