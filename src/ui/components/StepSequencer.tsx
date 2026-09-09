import { useEffect, useRef } from 'react';
import { useSequencer, SEQUENCER_KIT } from '../../store/sequencer';
import { useTransport } from '../../store/transport';
import { getEngine } from '../../audio/engine';
import { MAX_STEPS } from '../../sequencer/model';
import type { StepCell } from '../../sequencer/model';

const LENGTHS = [8, 16, 32];

function velDots(c: StepCell): string {
  if (!c.on) return '';
  const v = Math.round(c.velocity * 4);
  return '●'.repeat(Math.max(1, v));
}

function kitClass(i: number): string {
  const k = SEQUENCER_KIT[i % SEQUENCER_KIT.length] ?? 'kit';
  return `seq__pad--${k}`;
}

export function StepSequencer() {
  const pattern = useSequencer((s) => s.activePattern());
  const armed = useSequencer((s) => s.armed);
  const toggleArmed = useSequencer((s) => s.toggleArmed);
  const setActive = useSequencer((s) => s.setActive);
  const createPattern = useSequencer((s) => s.createPattern);
  const removePattern = useSequencer((s) => s.removePattern);
  const randomize = useSequencer((s) => s.randomize);
  const toggleStep = useSequencer((s) => s.toggleStep);
  const cycleVelocity = useSequencer((s) => s.cycleVelocity);
  const setLength = useSequencer((s) => s.setLength);
  const setSwing = useSequencer((s) => s.setSwing);
  const setHumanize = useSequencer((s) => s.setHumanize);
  const chain = useSequencer((s) => s.chain);
  const chainOn = useSequencer((s) => s.chainOn);
  const setChain = useSequencer((s) => s.setChain);
  const toggleChain = useSequencer((s) => s.toggleChain);
  const patterns = useSequencer((s) => s.patterns);
  const playing = useTransport((s) => s.playing);
  const playheadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!armed || !playing) return;
    let raf = 0;
    const loop = (): void => {
      const el = playheadRef.current;
      const p = useSequencer.getState().activePattern();
      if (el && p) {
        const step = Math.floor(getEngine().transport.nowBeats() * 4) % MAX_STEPS;
        const frac = (step % p.length) / p.length;
        el.style.left = `${frac * 100}%`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [armed, playing]);

  if (!pattern) return null;

  const onPad = (i: number): void => {
    if (pattern.steps[i].on) cycleVelocity(i);
    else toggleStep(i);
  };

  const toggleChainFor = (id: string): void => {
    const has = chain.some((c) => c.patternId === id);
    const next = has ? chain.filter((c) => c.patternId !== id) : [...chain, { patternId: id, bars: 1 }];
    setChain(next);
  };

  return (
    <section className="seq">
      <div className="seq__head">
        <select value={pattern.id} onChange={(e) => setActive(e.target.value)} className="seq__select">
          {patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn" onClick={() => createPattern()} title="New pattern">+</button>
        <button className="btn" onClick={() => removePattern(pattern.id)} title="Delete pattern" disabled={patterns.length <= 1}>✕</button>
        <button className={`btn${armed ? ' is-on' : ''}`} onClick={toggleArmed} title="Arm the step sequencer">SEQ</button>
        <button className={`btn${chainOn ? ' is-on' : ''}`} onClick={toggleChain} title="Loop chain (start→end)">CHAIN</button>
        <button className="btn" onClick={randomize} title="Randomize steps">🎲</button>
        <label className="seq__ctl">
          Len
          <select value={pattern.length} onChange={(e) => setLength(Number(e.target.value))}>
            {LENGTHS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="seq__ctl">
          Swing
          <input type="range" min={0} max={1} step={0.05} value={pattern.swing}
            onChange={(e) => setSwing(Number(e.target.value))} />
          <span className="seq__val">{pattern.swing.toFixed(2)}</span>
        </label>
        <label className="seq__ctl">
          Hum
          <input type="range" min={0} max={0.5} step={0.05} value={pattern.humanize}
            onChange={(e) => setHumanize(Number(e.target.value))} />
          <span className="seq__val">{pattern.humanize.toFixed(2)}</span>
        </label>
      </div>

      <div className="seq__pads">
        <div className="seq__playhead" ref={playheadRef} />
        {Array.from({ length: pattern.length }, (_, i) => {
          const c = pattern.steps[i];
          return (
            <button
              key={i}
              className={`seq__pad ${kitClass(i)}${c.on ? ' is-on' : ''}`}
              onClick={() => onPad(i)}
              title={`Step ${i + 1}${c.on ? ` · vel ${c.velocity}` : ''}`}
            >
              {c.on && (
                <>
                  <span className="seq__vel" style={{ height: `${Math.round(c.velocity * 100)}%` }} />
                  <span className="seq__dots">{velDots(c)}</span>
                  <span className="seq__mods">
                    {c.flam > 0 && `F${c.flam}`}
                    {c.ratchet > 1 && ` r${c.ratchet}`}
                    {c.probability < 1 && ` ${Math.round(c.probability * 100)}%`}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="seq__chain">
        <span className="seq__chain-label">Chain</span>
        {patterns.map((p) => (
          <button
            key={p.id}
            className={`seq__chip${chain.some((c) => c.patternId === p.id) ? ' is-on' : ''}${p.id === pattern.id ? ' is-active' : ''}`}
            onClick={() => toggleChainFor(p.id)}
            title={chain.some((c) => c.patternId === p.id) ? 'Remove from chain' : 'Add to chain'}
          >
            {p.name}
          </button>
        ))}
      </div>
    </section>
  );
}