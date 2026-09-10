import { useEffect, useRef, useState } from 'react';
import { useSequencer } from '../../store/sequencer';
import { useTransport } from '../../store/transport';
import { getEngine } from '../../audio/engine';
import { MAX_STEPS } from '../../sequencer/model';
import { kitLabel } from '../../sequencer/kits';
import { Nameplate } from './Nameplate';
import type { StepCell } from '../../sequencer/model';

const LENGTHS = [8, 16, 32];
const SWING_LEVELS = [0, 0.25, 0.5, 0.75];
const HUM_LEVELS = [0, 0.15, 0.3, 0.5];
const CELL = 48;
const HEAD_W = 84;
const pct = (v: number): string => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`);

const ROW_COLORS = [
  '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444',
  '#60a5fa', '#84cc16', '#f472b6', '#fb923c',
  '#22d3ee', '#a3e635', '#c084fc', '#f87171',
  '#38bdf8', '#4ade80', '#e879f9', '#facc15',
];

function velDots(c: StepCell): string {
  if (!c.on) return '';
  const v = Math.round(c.velocity * 4);
  return '●'.repeat(Math.max(1, v));
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
  const importSample = useSequencer((s) => s.importSample);
  const resetRow = useSequencer((s) => s.resetRow);
  const chain = useSequencer((s) => s.chain);
  const chainOn = useSequencer((s) => s.chainOn);
  const setChain = useSequencer((s) => s.setChain);
  const toggleChain = useSequencer((s) => s.toggleChain);
  const patterns = useSequencer((s) => s.patterns);
  const playing = useTransport((s) => s.playing);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pendingRow, setPendingRow] = useState<number | null>(null);

  useEffect(() => {
    if (!armed || !playing) return;
    let raf = 0;
    const loop = (): void => {
      const el = playheadRef.current;
      const p = useSequencer.getState().activePattern();
      if (el && p) {
        const step = Math.floor(getEngine().transport.nowBeats() * 4) % MAX_STEPS;
        const frac = (step % p.length) / p.length;
        el.style.left = `${HEAD_W + frac * p.length * CELL}px`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [armed, playing]);

  if (!pattern) return null;

  const onPad = (r: number, i: number): void => {
    if (pattern.rows[r].steps[i].on) cycleVelocity(r, i);
    else toggleStep(r, i);
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

  const pickSample = (r: number): void => {
    setPendingRow(r);
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (f && pendingRow !== null) void importSample(pendingRow, f);
    e.target.value = '';
  };

  const gridCols = `${HEAD_W}px repeat(${pattern.length}, ${CELL}px)`;

  return (
    <section className="seq skin-909">
      <div className="seq__head">
        <Nameplate model="TR-909" name="DRUM SEQUENCER" />
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

      <div className="seq__board">
        <div className="seq__rows">
          <div className="seq__playhead" ref={playheadRef} />
          {pattern.rows.map((row, r) => {
            const color = ROW_COLORS[r % ROW_COLORS.length];
            return (
              <div className="seq__row" key={`${row.voice}-${r}`} style={{ gridTemplateColumns: gridCols }}>
                <div className="seq__rowhead" style={{ borderColor: color }}>
                  <span className="seq__rowlabel" style={{ color: color }}>{row.kind === 'sample' ? row.sampleSha!.slice(0, 6) : kitLabel(row.voice)}</span>
                  <span className="seq__rowtools">
                    <button className="seq__rowbtn" onClick={() => pickSample(r)} title="Load WAV into this row">⇪</button>
                    {row.kind === 'sample' && (
                      <button className="seq__rowbtn" onClick={() => resetRow(r)} title="Back to synth voice">✕</button>
                    )}
                  </span>
                </div>
                <div className="seq__rowpads">
                  {Array.from({ length: pattern.length }, (_, i) => {
                    const c = row.steps[i];
                    const lit = c.on;
                    return (
                      <button
                        key={i}
                        className={`seq__pad${lit ? ' is-on' : ''}`}
                        style={{
                          color,
                          width: CELL,
                          height: CELL,
                          opacity: lit && c.probability < 1 ? 0.5 + 0.5 * c.probability : undefined,
                        }}
                        onClick={() => onPad(r, i)}
                        title={`${kitLabel(row.voice)} step ${i + 1}${c.on ? ` · vel ${c.velocity}` : ''}`}
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
              </div>
            );
          })}
        </div>
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

      <input ref={fileRef} type="file" accept="audio/wav,.wav" hidden onChange={onFile} />
    </section>
  );
}