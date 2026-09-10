import { useEffect, useRef, useState } from 'react';
import { getEngine } from '../../audio/engine';
import { MixerStrips } from '../components/MixerStrips';
import { Fader } from '../components/Fader';

/** Mixer as a translucent studio overlay (UI-REDESIGN §4). */
export function MixerPanel() {
  return (
    <>
      <h3 className="overlay__title">Mixer</h3>
      <div className="mixer mixer--overlay">
        <MixerStrips />
      </div>
    </>
  );
}

/** Master gain + peak meter overlay. Color zones land in Phase B (§7). */
export function MasterPanel() {
  const [gain, setGain] = useState(0.9);
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      const el = fillRef.current;
      if (el) {
        const [l, r] = getEngine().graph.master.meter();
        const pct = Math.min(1, Math.max(0, Math.max(l, r)) * 1.6);
        el.style.height = `${pct * 100}%`;
        el.style.background = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#f59e0b' : '#14b8a6';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onGain = (v: number): void => {
    setGain(v);
    getEngine().graph.master.setGain(v);
  };

  return (
    <>
      <h3 className="overlay__title">Master</h3>
      <div className="studio__master">
        <div className="mixer__strip mixer__strip--master">
          <div className="mixer__head">Master</div>
          <div className="meter meter--v">
            <div ref={fillRef} className="meter__fill" />
          </div>
          <Fader orientation="vertical" value={gain} onChange={onGain} label="vol" />
        </div>
        <p className="overlay__hint">Master gain · peak meter. Loudness + color-zone metering land in Phase B.</p>
      </div>
    </>
  );
}