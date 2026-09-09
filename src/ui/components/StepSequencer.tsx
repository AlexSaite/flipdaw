import { useEffect, useRef } from 'react';
import { useSequencer, SEQUENCER_KIT } from '../../store/sequencer';
import { useTransport } from '../../store/transport';
import { getEngine } from '../../audio/engine';
import { MAX_STEPS } from '../../sequencer/model';
import type { StepCell } from '../../sequencer/model';

const LENGTHS = [8, 16, 32];
const SWING_LEVELS = [0, 0.25, 0.5, 0.75];
const HUM_LEVELS = [0, 0.15, 0.3, 0.5];
const pct = (v: number): string => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`);

function velDots(c: StepCell): string {
  if (!c.on) return '';
  const v = Math.round(c.velocity * 4);
  return '●'.repeat(Math.max(1, v));
}

function kitClass(i: number): string {
  const k = SEQUENCER_KIT[i % SEQUENCER_KIT.length] ?? 'kit';
  return `seq__pad--${k}`;
}

const CHIP_COLORS = ['#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#60a5fa', '#84cc16'];

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

  const chipColor = (id: string): string => {
    const i = patterns.findIndex((x) => x.id === id);
    return CHIP_COLORS[Math.max(0, i) % CHIP_COLORS.length];
  };

  return (
    <section className="seq">
      <div className="seq__head">
        <div className="seq__head-group">
          {patterns.map((p) => (
            <button
              key={p.id}
              className={`seq__pat-chip${p.id === pattern.id ? ' is-on' : ''}`}
              onClick={() => setActive(p.id)}
              style={p.id === pattern.id ? { background: chipColor(p.id), borderColor: chipColor(p.id) } : undefined}
              title={`Select ${p.name}`}
            >
              <span className="seq__pat-dot" style={{ background: chipColor(p.id) }} />
              {p.name}
            </button>
          ))}
          <button className="btn" onClick={() => createPattern()} title="New pattern">+</button>
          <button className="btn" onClick={() => removePattern(pattern.id)} title="Delete pattern" disabled={patterns.length <= 1}>✕</button>
          <button className={`btn${armed ? ' is-on' : ''}`} onClick={toggleArmed} title="Arm the step sequencer">SEQ</button>
          <button className={`btn${chainOn ? ' is-on' : ''}`} onClick={toggleChain} title="Loop chain (start→end)">CHAIN</button>
          <button className="btn" onClick={randomize} title="Randomize steps">🎲</button>
        </div>

        <span className="seq__divider" />

        <div className="seq__head-group">
          <div className="seq__ctl">
            <span className="seq__ctl-label">Len</span>
            <div className="seg">
              {LENGTHS.map((n) => (
                <button key={n} className={`seg-btn${pattern.length === n ? ' is-on' : ''}`} onClick={() => setLength(n)} title={`${n} steps`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="seq__ctl">
            <span className="seq__ctl-label">Swing</span>
            <div className="seg">
              {SWING_LEVELS.map((v) => (
                <button key={v} className={`seg-btn${pattern.swing === v ? ' is-on' : ''}`} onClick={() => setSwing(v)}>{pct(v)}</button>
              ))}
            </div>
          </div>
          <div className="seq__ctl">
            <span className="seq__ctl-label">Hum</span>
            <div className="seg">
              {HUM_LEVELS.map((v) => (
                <button key={v} className={`seg-btn${pattern.humanize === v ? ' is-on' : ''}`} onClick={() => setHumanize(v)}>{pct(v)}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="seq__pads">
        <div className="seq__playhead" ref={playheadRef} />
        {Array.from({ length: pattern.length }, (_, i) => {
          const c = pattern.steps[i];
          const lit = c.on;
          return (
            <button
              key={i}
              className={`seq__pad ${kitClass(i)}${lit ? ' is-on' : ''}`}
              style={lit && c.probability < 1 ? { opacity: 0.5 + 0.5 * c.probability, filter: 'none' } : undefined}
              onClick={() => onPad(i)}
              title={`Step ${i + 1}${c.on ? ` · vel ${c.velocity}` : ''}`}
            >
              {lit && (
                <>
                  <span className="seq__vel" style={{ height: `${Math.round(c.velocity * 100)}%` }} />
                  <span className="seq__dots">{velDots(c)}</span>
                  <span className="seq__mods">
                    {c.ratchet > 1 && <span>∞{c.ratchet}</span>}
                    {c.flam > 0 && <span>≈</span>}
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