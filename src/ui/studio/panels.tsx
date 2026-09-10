import { useState } from 'react';
import { getEngine } from '../../audio/engine';
import { MixerStrips } from '../components/MixerStrips';
import { Fader } from '../components/Fader';
import { DbMeter } from '../components/DbMeter';
import { useSettings } from '../../store/settings';

/** Mixer as a translucent studio overlay: per-track strips + the master bus
 *  (fader, peak/loudness meter). One entry point — no duplicate buttons. */
export function MixerPanel() {
  return (
    <>
      <h3 className="overlay__title">Mixer</h3>
      <div className="mixer mixer--overlay">
        <MixerStrips />
      </div>
      <MasterStrip />
    </>
  );
}

/** Master bus: gain fader + three-zone peak/loudness meter (UI-REDESIGN §7). */
function MasterStrip() {
  const [gain, setGain] = useState(0.9);
  const meterMode = useSettings((s) => s.meterMode);

  const onGain = (v: number): void => {
    setGain(v);
    getEngine().graph.master.setGain(v);
  };

  const readMaster = (): number => {
    const [l, r] = getEngine().graph.master.meter();
    return Math.max(l, r);
  };

  return (
    <div className="studio__master">
      <div className="mixer__strip mixer__strip--master">
        <div className="mixer__head">Master</div>
        <DbMeter vertical read={readMaster} mode={meterMode === 'loudness' ? 'loudness' : 'peak'} readout />
        <Fader orientation="vertical" value={gain} onChange={onGain} label="vol" step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <p className="overlay__hint">
        {meterMode === 'loudness'
          ? 'Loudness bar ≈ EBU R128, reference −18 LUFS (lightweight meter).'
          : 'Peak meter: three-color zones (ГОСТ Р МЭК 60268-18), hold line 2.8 s.'}
      </p>
    </div>
  );
}