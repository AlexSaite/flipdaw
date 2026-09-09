import { useEffect, useRef } from 'react';
import { useGrid } from '../../store/project';

interface MeterProps {
  trackId: string;
  vertical?: boolean;
}

/** Peak meter driven by rAF reading the track strip analyser directly. */
export function Meter({ trackId, vertical = true }: MeterProps) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      const el = fillRef.current;
      if (el) {
        const p = useGrid.getState().meter(trackId);
        const pct = Math.min(1, Math.max(0, p) * 1.6); // scale headroom
        el.style.height = vertical ? `${pct * 100}%` : '100%';
        el.style.width = vertical ? '100%' : `${pct * 100}%`;
        el.style.background = pct > 0.9 ? '#ef4444' : pct > 0.7 ? '#f59e0b' : '#14b8a6';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [trackId, vertical]);

  return (
    <div className={`meter${vertical ? ' meter--v' : ' meter--h'}`}>
      <div ref={fillRef} className="meter__fill" />
    </div>
  );
}
