import { useEffect, useRef } from 'react';
import { useGrid, type CellId } from '../../store/project';
import { useTransport } from '../../store/transport';
import { getEngine } from '../../audio/engine';

const R = 42;
const L = 2 * Math.PI * R;

interface CellProps {
  id: CellId;
  color: string;
  big?: boolean;
}

export function Cell({ id, color, big = false }: CellProps) {
  const state = useGrid((s) => s.cells[id]?.state ?? 'empty');
  const hasClip = useGrid((s) => Boolean(s.cells[id]?.clip));
  const selected = useGrid((s) => s.selected === id);
  const tap = useGrid((s) => s.tap);
  const select = useGrid((s) => s.select);
  const playing = useTransport((s) => s.playing);
  const ringRef = useRef<SVGCircleElement>(null);
  const longRef = useRef<number | null>(null);

  // Progress ring: write to DOM directly from rAF — no React re-renders
  useEffect(() => {
    if (state !== 'playing' || !playing) return;
    let raf = 0;
    const loop = (): void => {
      const el = ringRef.current;
      const player = useGrid.getState().players[id];
      if (el && player) {
        const p = player.progress(getEngine().ctx.currentTime);
        el.style.strokeDashoffset = String(L * (1 - p));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, playing, id]);

  const onDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    longRef.current = window.setTimeout(() => { longRef.current = null; }, 300);
  };
  const onUp = (): void => {
    if (longRef.current !== null) {
      window.clearTimeout(longRef.current); longRef.current = null;
      select(id);
      tap(id);
    }
  };
  const onCancel = (): void => {
    if (longRef.current !== null) { window.clearTimeout(longRef.current); longRef.current = null; }
  };

  const cls = [
    'cell',
    big ? ' cell--big' : '',
    ` cell--${state}`,
    selected ? ' cell--selected' : '',
    hasClip ? ' cell--has-clip' : '',
  ].join('');

  return (
    <button
      className={cls}
      style={{ '--c': color } as React.CSSProperties}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      aria-label={`clip ${id} (${state})`}
    >
      {state === 'playing' && (
        <svg className="cell__ring" viewBox="0 0 100 100" aria-hidden>
          <circle ref={ringRef} cx="50" cy="50" r={R} fill="none" stroke="currentColor"
            strokeWidth="6" strokeDasharray={L} strokeDashoffset={L} />
        </svg>
      )}
    </button>
  );
}
