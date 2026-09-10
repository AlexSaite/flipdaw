import { useEffect, useState } from 'react';
import { getEngine } from '../../audio/engine';
import { MAX_STEPS } from '../../sequencer/model';
import { useSequencer } from '../../store/sequencer';
import { useTransport } from '../../store/transport';
import { usePiano } from '../../store/piano';
import { PianoModel } from '../../piano/model';
import { useSampler } from '../../store/sampler';
import { useDeck } from '../../store/deck';
import { useGrid, cellId } from '../../store/project';
import { useUi, type DeckKey } from '../../store/ui';

/** Re-render on a slow cadence so live previews track the playhead cheaply. */
function useTick(ms: number): void {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

const PREV_COLS = 16;
const PAD = 10;
const PAD_GAP = 2;

const ROW_COLORS = [
  '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444',
  '#60a5fa', '#84cc16', '#f472b6', '#fb923c',
  '#22d3ee', '#a3e635', '#c084fc', '#f87171',
  '#38bdf8', '#4ade80', '#e879f9', '#facc15',
];

function DrumPreview() {
  const pattern = useSequencer((s) => s.activePattern());
  const playing = useTransport((s) => s.playing);
  useTick(150);
  if (!pattern) return null;
  const cols = Math.min(pattern.length, PREV_COLS);
  const rowW = PAD * cols + PAD_GAP * (cols - 1);
  const stepIdx = playing ? Math.floor(getEngine().transport.nowBeats() * 4) % Math.min(pattern.length, MAX_STEPS) : -1;
  const leftPct = stepIdx < 0 ? null : ((stepIdx % cols) * (PAD + PAD_GAP)) / rowW;
  return (
    <div className="pvdrum" title="16-voice step sequencer">
      {pattern.rows.map((row, r) => {
        const color = ROW_COLORS[r % ROW_COLORS.length];
        return (
          <div
            key={r}
            className="pvdrum__row"
            style={{ gridTemplateColumns: `repeat(${cols}, ${PAD}px)`, color }}
          >
            {row.steps.slice(0, cols).map((c, i) => (
              <span key={i} className={`pvdrum__pad${c.on ? ' is-on' : ''}`} />
            ))}
          </div>
        );
      })}
      {leftPct !== null && <span className="pvdrum__headbar" style={{ left: `${leftPct * 100}%` }} />}
    </div>
  );
}

function PianoPreview() {
  const octave = usePiano((s) => s.octave);
  const held = usePiano((s) => s.held);
  const sustain = usePiano((s) => s.sustain);
  const model = new PianoModel(octave);
  const naturals = model.naturals();
  const accidentals = model.accidentals();
  const n = naturals.length;
  const blackW = (100 / n) * 0.62;
  return (
    <div className="pvkeys" title={`Piano · C${octave}${sustain ? ' · hold' : ''}`}>
      {naturals.map((midi) => (
        <span key={midi} className={`pvkeys__w${held.has(midi) ? ' is-on' : ''}`} />
      ))}
      {accidentals.map((a) => (
        <span
          key={a.midi}
          className={`pvkeys__b${held.has(a.midi) ? ' is-on' : ''}`}
          style={{ left: `calc(${(a.whiteAfter / n) * 100}% - ${blackW / 2}%)`, width: `${blackW}%` }}
        />
      ))}
    </div>
  );
}

function SamplerPreview() {
  const pads = useSampler((s) => s.pads);
  const mode = useSampler((s) => s.mode);
  const chromatic = useSampler((s) => s.chromatic);
  return (
    <div className="pvpad-grid" title="Pad sampler">
      {pads.slice(0, 4).map((pad) => (
        <span key={pad.id} className={`pvpad${pad.buffer ? ' has' : ''}`}>{pad.buffer ? '' : '+'}</span>
      ))}
      <span className="pvpad-meta">{mode === 'loop' ? '∞ loop' : '▶ shot'}{chromatic ? ' · ♫' : ''}</span>
    </div>
  );
}

function DJPreview() {
  const deckA = useDeck((s) => s.deckA);
  const deckB = useDeck((s) => s.deckB);
  const cross = useDeck((s) => s.cross);
  return (
    <div className="pvdj" title="DJ decks">
      <span className={`pvdj__chan${deckA.state === 'playing' ? ' is-on' : ''}`}>A</span>
      <div className="pvdj__fader">
        <span className="pvdj__thumb" style={{ left: `${cross * 100}%` }} />
      </div>
      <span className={`pvdj__chan${deckB.state === 'playing' ? ' is-on' : ''}`}>B</span>
    </div>
  );
}

function GridPreview() {
  const tracks = useGrid((s) => s.tracks);
  const sceneCount = useGrid((s) => s.sceneCount);
  const cells = useGrid((s) => s.cells);
  return (
    <div className="pvgrid" title="Clip grid">
      {tracks.slice(0, 8).map((t) => (
        <div key={t.id} className="pvgrid__col" style={{ color: t.color }}>
          {Array.from({ length: Math.min(sceneCount, 8) }, (_, sc) => {
            const has = !!cells[cellId(t.id, sc)]?.clip;
            return (
              <span
                key={sc}
                className={`pvcell${has ? ' has' : ''}`}
                style={has ? { background: t.color, borderColor: t.color } : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const DECKS: { key: DeckKey; label: string; title: string }[] = [
  { key: 'grid', label: 'Grid', title: 'Clip grid' },
  { key: 'drum', label: 'Drum', title: '16-voice step sequencer' },
  { key: 'piano', label: 'Piano', title: 'Piano keys' },
  { key: 'sampler', label: 'Sampler', title: 'Pad sampler' },
  { key: 'dj', label: 'Decks', title: 'DJ decks' },
];

/** Compact deck switcher: previews of every instrument, tap to expand. */
export function DeckDock() {
  const activeDeck = useUi((s) => s.activeDeck);
  const setActiveDeck = useUi((s) => s.setActiveDeck);
  return (
    <div className="deckdock" role="tablist">
      {DECKS.map((d) => (
        <button
          key={d.key}
          role="tab"
          aria-selected={activeDeck === d.key}
          className={`deckdock__card${activeDeck === d.key ? ' is-active' : ''}`}
          onClick={() => setActiveDeck(d.key)}
          title={`Expand: ${d.title}`}
        >
          <span className="deckdock__prev">
            {d.key === 'grid' && <GridPreview />}
            {d.key === 'drum' && <DrumPreview />}
            {d.key === 'piano' && <PianoPreview />}
            {d.key === 'sampler' && <SamplerPreview />}
            {d.key === 'dj' && <DJPreview />}
          </span>
          <span className="deckdock__label">{d.label}</span>
        </button>
      ))}
    </div>
  );
}