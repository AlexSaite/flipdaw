import { useUi } from '../../store/ui';
import { useSettings, type Theme, type LatencyPreset, type Density } from '../../store/settings';
import { getEngine } from '../../audio/engine';

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const settings = useSettings();
  const { set } = useSettings();

  if (!open) return null;

  const onMetroToggle = (on: boolean): void => {
    set({ metroEnabled: on });
    getEngine().metronome.setEnabled(on);
  };

  return (
    <div className="modal-backdrop" onPointerDown={() => setOpen(false)}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <label className="modal__row">
          Theme
          <select value={settings.theme} onChange={(e) => set({ theme: e.target.value as Theme })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label className="modal__row">
          Latency
          <select value={settings.latency} onChange={(e) => set({ latency: e.target.value as LatencyPreset })}>
            <option value="fast">Fast (20ms lookahead)</option>
            <option value="standard">Standard (60ms)</option>
            <option value="safe">Safe (120ms)</option>
          </select>
        </label>

        <label className="modal__row">
          Density
          <select value={settings.density} onChange={(e) => set({ density: e.target.value as Density })}>
            <option value="comfort">Comfort</option>
            <option value="dense">Dense</option>
          </select>
        </label>

        <div className="modal__row">
          Metronome
          <button className={`btn btn--toggle${settings.metroEnabled ? ' is-on' : ''}`}
            onClick={() => onMetroToggle(!settings.metroEnabled)}>
            {settings.metroEnabled ? 'On' : 'Off'}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={settings.metroGain}
            onChange={(e) => {
              const g = Number(e.target.value);
              set({ metroGain: g });
              getEngine().metronome.setGain(g);
            }} />
        </div>

        <label className="modal__row">
          Autosave (s)
          <input type="number" min={0} max={600} step={10} value={settings.autosaveSec}
            onChange={(e) => set({ autosaveSec: Math.max(0, Number(e.target.value)) })} />
        </label>

        <button className="btn modal__close" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>
  );
}