import { useEffect, useRef } from 'react';
import { useDeck, deckPlayer, type DeckSide } from '../../store/deck';
import { getEngine } from '../../audio/engine';
import { drawPeaks } from '../../project/thumbs';
import { EQ_BANDS, EQ_RANGE_DB, type EqBand } from '../../audio/deckMixer';
import { useGrid } from '../../store/project';
import { toast } from '../../store/toasts';

/**
 * Two-deck DJ surface (M6.3). Decks load a clip from the grid (or any WAV),
 * play bar-quantized, sync phase to the transport, carry a hot cue + loop
 * region, per-deck 3-band EQ (±12 dB) and a constant-power crossfader.
 * Waveform markers draw imperatively in rAF (no React re-render per frame).
 */
export function DJDeck() {
  return (
    <section className="deck">
      <div className="seq__head-group">
        <span className="seq__ctl-label">Decks</span>
        <span className="deck__hint">bar-quantized · fixed pitch (ADR-012)</span>
      </div>
      <div className="deck__cols">
        <DeckCol side="A" />
        <DeckCol side="B" />
      </div>
      <Crossfader />
    </section>
  );
}

function vmOf(side: DeckSide) {
  return side === 'A' ? useDeck.getState().deckA : useDeck.getState().deckB;
}

function DeckCol({ side }: { side: DeckSide }) {
  const vm = useDeck((s) => (side === 'A' ? s.deckA : s.deckB));
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (): Promise<void> => {
    const f = fileRef.current?.files?.[0];
    if (f) await useDeck.getState().loadFile(side, f);
  };

  const loadCell = (): void => {
    const sel = useGrid.getState().selected;
    if (!sel) { toast.error('Select a grid cell first'); return; }
    void useDeck.getState().loadFromCell(side, sel);
  };

  return (
    <div className="deck__col">
      <div className="deck__head">
        <span className="deck__name">{vm.file ? vm.file.split('/').pop() : vm.name}</span>
        <div className="seg">
          <button
            className={`seg-btn${vm.state === 'playing' ? ' is-on' : ''}`}
            onClick={() => (vm.state === 'playing' ? useDeck.getState().pause(side) : useDeck.getState().play(side))}
            disabled={vm.state === 'empty'}
          >
            {vm.state === 'playing' ? 'Pause' : 'Play'}
          </button>
          <button className="seg-btn" onClick={() => useDeck.getState().sync(side)} disabled={vm.state === 'empty'} title="Phase-align to next bar">Sync</button>
          <button className="seg-btn" onClick={() => useDeck.getState().cue(side)} disabled={vm.state === 'empty'} title="Drop cue at current bar">Cue</button>
          <button className="seg-btn" onClick={() => useDeck.getState().jump(side)} disabled={vm.cueBeat === null} title="Jump to cue">⏪</button>
          <button className={`seg-btn${vm.loopBeats !== null ? ' is-on' : ''}`} onClick={() => useDeck.getState().toggleLoop(side)} disabled={vm.state === 'empty'}>
            {vm.loopBeats !== null ? `Loop ${vm.loopBeats}` : 'Loop'}
          </button>
        </div>
        <div className="seg">
          <button className="seg-btn" onClick={loadCell} title="Load the selected cell">⧉ Cell</button>
          <button className="seg-btn" onClick={() => fileRef.current?.click()} title="Load a WAV file">⇪</button>
          <input ref={fileRef} type="file" accept="audio/wav,audio/x-wav,.wav" hidden onChange={() => void onFile()} />
        </div>
      </div>
      <DeckWave side={side} />
      <div className="deck__eq">
        {EQ_BANDS.map((band) => <EqTrack key={band} side={side} band={band} />)}
      </div>
    </div>
  );
}

function DeckWave({ side }: { side: DeckSide }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      const cv = ref.current;
      if (cv) {
        const g = cv.getContext('2d');
        const vm = vmOf(side);
        let peaks = vm.peaks;
        if (g && peaks) {
          drawPeaks(g, peaks, cv.width, cv.height, '#14b8a6');
          const d = deckPlayer(side);
          if (d.attached && d.playing) {
            const p = d.progress(getEngine().ctx.currentTime);
            const x = Math.round(p * cv.width);
            g.strokeStyle = '#f59e0b';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(x + 0.5, 0);
            g.lineTo(x + 0.5, cv.height);
            g.stroke();
          }
        } else if (g) {
          g.clearRect(0, 0, cv.width, cv.height);
          g.fillStyle = '#3d3f45';
          g.font = '10px system-ui';
          g.fillText(vm.state === 'empty' ? 'idle' : 'stopped', 6, cv.height / 2);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [side]);

  return <canvas ref={ref} width={320} height={64} className="deck__wave" />;
}

function EqTrack({ side, band }: { side: DeckSide; band: EqBand }) {
  const db = useDeck((s) => (side === 'A' ? s.deckA : s.deckB).eq[band]);
  const drag = useRef<{ y: number; db: number } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const pct = ((db + EQ_RANGE_DB) / (2 * EQ_RANGE_DB)) * 100;

  return (
    <div className="deck__eq-col">
      <span className="deck__eq-label">{band.toUpperCase()}</span>
      <div
        ref={trackRef}
        className="deck__eq-track"
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = { y: e.clientY, db };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !trackRef.current) return;
          const dy = d.y - e.clientY;
          useDeck.getState().setEq(side, band, Math.round(d.db + (dy / trackRef.current.clientHeight) * EQ_RANGE_DB * 2));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div className="deck__eq-thumb" style={{ bottom: `${pct}%` }} />
      </div>
      <span className="deck__eq-value">{db > 0 ? `+${db}` : db} dB</span>
    </div>
  );
}

function Crossfader() {
  const cross = useDeck((s) => s.cross);
  const drag = useRef<{ x: number; v: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className="deck__xfade-wrap">
      <span className="deck__xfade-side">A</span>
      <div
        ref={ref}
        className="deck__xfade"
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = { x: e.clientX, v: cross };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !ref.current) return;
          const dx = e.clientX - d.x;
          useDeck.getState().setCross(Math.round((d.v + dx / ref.current.clientWidth) * 100) / 100);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <div className="deck__xfade-thumb" style={{ left: `${cross * 100}%` }} />
        <div className="deck__xfade-notch" />
      </div>
      <span className="deck__xfade-side">B</span>
      <span className="deck__xfade-value">{Math.round(cross * 100)}%</span>
    </div>
  );
}