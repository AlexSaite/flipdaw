import { useEffect } from 'react';
import { LaptopLayout } from './ui/layouts/LaptopLayout';
import { TentLayout } from './ui/layouts/TentLayout';
import { MixerLayout } from './ui/layouts/MixerLayout';
import { SettingsModal } from './ui/components/SettingsModal';
import { MappingModal } from './ui/components/MappingModal';
import { useUi, type LayoutMode } from './store/ui';
import { useHistory } from './store/history';
import { useSettings } from './store/settings';
import { useGrid } from './store/project';
import { getEngine } from './audio/engine';
import { bindBridge } from './bridge/bind';

const MODE_KEYS: Record<string, LayoutMode> = { '1': 'laptop', '2': 'tent', '3': 'mixer' };

function App() {
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const applyToDom = useSettings((s) => s.applyToDom);
  const autosaveSec = useSettings((s) => s.autosaveSec);

  useEffect(() => {
    applyToDom();
    const onKey = (e: KeyboardEvent): void => {
      const m = MODE_KEYS[e.key];
      if (m) { setMode(m); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useHistory.getState().redo();
        else useHistory.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useHistory.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode, applyToDom]);

  useEffect(() => {
    void getEngine().resume();
    const s = useSettings.getState();
    getEngine().metronome.setEnabled(s.metroEnabled);
    getEngine().metronome.setGain(s.metroGain);
    const unbind = bindBridge();
    return () => unbind();
  }, []);

  // Autosave: rotate-through-backups every N seconds while dirty.
  useEffect(() => {
    if (!autosaveSec) return;
    const id = window.setInterval(() => {
      const g = useGrid.getState();
      if (g.editorStatus === 'dirty') void g.autosave();
    }, autosaveSec * 1000);
    return () => window.clearInterval(id);
  }, [autosaveSec]);

  return (
    <>
      {mode === 'laptop' && <LaptopLayout />}
      {mode === 'tent' && <TentLayout />}
      {mode === 'mixer' && <MixerLayout />}
      <SettingsModal />
      <MappingModal />
    </>
  );
}

export default App