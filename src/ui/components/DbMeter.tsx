import { useEffect, useRef } from 'react';
import {
  clamp01, dbToPct, HOLD_FALL_DB_PER_MS, integrateLoudness, loudnessLu,
  luToPct, METER_FLOOR_DB, meterZone, toDb, zoneColor,
} from '../metering';

export type MeterMode = 'peak' | 'loudness';

interface DbMeterProps {
  /** Reads the current level (0..1). Called once per rAF; UI thread only. */
  read(): number;
  /** Vertical bar (default). Horizontal when false. */
  vertical?: boolean;
  /**
   * 'peak' (default): three-colour PPM bar with a slow-fall hold line
   * (ГОСТ Р МЭК 60268-18). 'loudness': EBU R128-style bar centred on the
   * −18 LUFS reference with a target tick.
   */
  mode?: MeterMode;
  /** Show a numeric readout below the bar. */
  readout?: boolean;
}

/** Level meter that writes straight to refs in rAF (no React re-render per
 *  frame). Ballistics: rise instant, fall ≈ 20 dB / 2.8 s hold (IEC 60268-10). */
export function DbMeter({ read, vertical = true, mode = 'peak', readout = false }: DbMeterProps) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const holdRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const state = useRef({ last: 0, holdDb: -60, power: 0 });

  useEffect(() => {
    const s = state.current;
    let raf = 0;
    const loop = (now: number): void => {
      const fill = fillRef.current;
      const dt = s.last === 0 ? 16 : now - s.last;
      s.last = now;
      if (fill) {
        const p = clamp01(read());
        const db = toDb(p);
        const ro = readoutRef.current;
        if (mode === 'peak') {
          let hold = s.holdDb;
          if (db > hold) hold = db;
          else hold -= HOLD_FALL_DB_PER_MS * dt;
          s.holdDb = Math.max(-60, hold);
          const pct = dbToPct(db, METER_FLOOR_DB);
          fill.style.height = vertical ? `${pct * 100}%` : '100%';
          fill.style.width = vertical ? '100%' : `${pct * 100}%`;
          fill.style.background = zoneColor(meterZone(db));
          const holdEl = holdRef.current;
          if (holdEl) {
            const hp = dbToPct(s.holdDb, METER_FLOOR_DB);
            if (vertical) { holdEl.style.bottom = `${hp * 100}%`; }
            else { holdEl.style.left = `${hp * 100}%`; }
          }
          if (ro) ro.textContent = `${db.toFixed(1)} dB`;
        } else {
          s.power = integrateLoudness(p, s.power);
          const lu = loudnessLu(s.power);
          const pct = luToPct(lu);
          fill.style.height = vertical ? `${pct * 100}%` : '100%';
          fill.style.width = vertical ? '100%' : `${pct * 100}%`;
          fill.style.background = lu >= -9 ? '#f59e0b' : '#14b8a6';
          if (ro) ro.textContent = `${lu.toFixed(1)} LU`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [read, vertical, mode]);

  return (
    <div className="dbmeter" data-vertical={vertical || undefined} data-mode={mode}>
      <div className={`meter${vertical ? ' meter--v' : ' meter--h'}`}>
        <div ref={fillRef} className="meter__fill" />
        {mode === 'peak' && <div ref={holdRef} className="meter__hold" />}
        {mode === 'loudness' && <div className="meter__tick" />}
      </div>
      {readout && <span ref={readoutRef} className="dbmeter__readout" />}
    </div>
  );
}