import { useEffect } from 'react';
import { StudioLayout } from './ui/layouts/StudioLayout';
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
import { subscribeTransportToEngine } from './store/transport';
import { bindBridge } from './bridge/bind';

const MODE_KEYS: Record<string, LayoutMode> = { '1': 'studio', '2': 'tent', '3': 'mixer', '4': 'laptop' };

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
    const s = useSettings.getState();
    getEngine().metronome.setEnabled(s.metroEnabled);
    getEngine().metronome.setGain(s.metroGain);
    // Seed the demo project on first boot so the canvas is never empty.
    void useGrid.getState().init();
    const unsubTransport = subscribeTransportToEngine();
    const unbind = bindBridge();
    // Autoplay policy: AudioContext may only start on a user gesture.
    // Resume once on the first pointer/key/touch event anywhere in the app.
    const resume = (): void => { void getEngine().resume(); };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true, passive: true });
    return () => {
      unsubTransport();
      unbind();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
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
      {mode === 'studio' && <StudioLayout />}
      {mode === 'laptop' && <LaptopLayout />}
      {mode === 'tent' && <TentLayout />}
      {mode === 'mixer' && <MixerLayout />}
      <SettingsModal />
      <MappingModal />
    </>
  );
}

export default App