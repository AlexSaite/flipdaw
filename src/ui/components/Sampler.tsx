import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useSampler } from '../../store/sampler';
import { SAMPLER_PADS, type ChopMode, type PadMode } from '../../sampler/model';
import { Nameplate } from './Nameplate';

/**
 * Pad sampler (M6.2). 4x2 grid over decoded WAVs. Mode (loop/one-shot) and
 * chop style (equal/lazy) are global chips; pads have their own load + auto
 * chop-into-4 controls. Velocity from the tap zone (ADR-013): lower half of
 * a pad is accented. Chromatic maps pads to a semitone staircase via
 * playbackRate. Trigger timing is ctx-accurate (ADR-001).
 */
export function Sampler() {
  const pads = useSampler((s) => s.pads);
  const chromatic = useSampler((s) => s.chromatic);
  const chopMode = useSampler((s) => s.chopMode);
  const mode = useSampler((s) => s.mode);
  const setChromatic = useSampler((s) => s.setChromatic);
  const setChopMode = useSampler((s) => s.setChopMode);
  const setMode = useSampler((s) => s.setMode);
  const trigger = useSampler((s) => s.trigger);
  const loadSample = useSampler((s) => s.loadSample);
  const chopFill = useSampler((s) => s.chopFill);
  const clearPad = useSampler((s) => s.clearPad);

  const [sounding, setSounding] = useState<Set<number>>(new Set());
  const flashTimer = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const loadTarget = useRef(0);

  useEffect(() => () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, []);

  const velocity = (e: PointerEvent<HTMLButtonElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientY - r.top) / r.height >= 0.5 ? 1 : 0.72;
  };

  const hit = (i: number, e: PointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    trigger(i, velocity(e));
    setSounding((s) => new Set(s).add(i));
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSounding(new Set()), 140);
  };

  const pick = (i: number): void => {
    loadTarget.current = i;
    fileInput.current?.click();
  };

  const onFile = async (): Promise<void> => {
    const f = fileInput.current?.files?.[0];
    if (f) await loadSample(loadTarget.current, f);
  };

  return (
    <section className="sampler skin-mpc">
      <div className="sampler__head">
        <div className="seq__head-group">
          <Nameplate model="MPC" name="PAD SAMPLER" />
          <div className="seg">
            {(['loop', 'oneshot'] as PadMode[]).map((m) => (
              <button key={m} className={`seg-btn${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)} title={`${m} playback`}>
                {m === 'loop' ? '∞ Loop' : '▶ Shot'}
              </button>
            ))}
          </div>
          <div className="seg">
            {(['equal', 'lazy'] as ChopMode[]).map((m) => (
              <button key={m} className={`seg-btn${chopMode === m ? ' is-on' : ''}`} onClick={() => setChopMode(m)} title={`${m} chops`}>
                {m === 'equal' ? 'EQ Chop' : 'LZ Chop'}
              </button>
            ))}
          </div>
          <button className={`seg-btn${chromatic ? ' is-on' : ''}`} onClick={() => setChromatic(!chromatic)} title="Semitone staircase pitch">
            ♫ Chromatic
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/wav,audio/x-wav,.wav"
            hidden
            onChange={() => void onFile()}
          />
        </div>
      </div>

      <div className="sampler__grid">
        {pads.slice(0, SAMPLER_PADS).map((pad, i) => {
          const empty = !pad.buffer;
          return (
            <div key={pad.id} className={`sampler__card${empty ? '' : ' has'}`}>
              <button
                className={`sampler__pad${sounding.has(i) ? ' is-sounding' : ''}`}
                onPointerDown={(e) => hit(i, e)}
                onContextMenu={(e) => e.preventDefault()}
                disabled={empty}
                title={empty ? `Load a WAV into pad ${i + 1}` : `${pad.name} (${pad.file})`}
              >
                {empty ? '+' : pad.name}
              </button>
              <div className="sampler__tools">
                <button className="sampler__tool" onClick={() => pick(i)} title="Load WAV">⇪</button>
                <button className="sampler__tool" onClick={() => chopFill(i, 4)} disabled={empty} title="Split into 4 pads">✂4</button>
                {!empty && <button className="sampler__tool" onClick={() => clearPad(i)} title="Clear pad">✕</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}