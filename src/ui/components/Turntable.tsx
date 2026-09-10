import { useEffect, useRef, type PointerEvent } from 'react';
import { useTurntable, turntablePlayer } from '../../store/turntable';
import { useGrid } from '../../store/project';
import { getEngine } from '../../audio/engine';
import { Fader } from './Fader';
import { Nameplate } from './Nameplate';
import { toast } from '../../store/toasts';

/**
 * Turntable deck (M7, SL-1200 skin). Free-running vinyl: a loaded WAV loops
 * as a rotating record, the needle tracks position, drag the record to scrub
 * (sample-accurate seek), pitch fader 50–160%. The platter spins on its own —
 * it is an instrument, not a grid follower (ADR-001 timing throughout).
 */

const TURNS = 3; // visual turns of the vinyl per play-through

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const t = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

export function Turntable() {
  const vm = useTurntable((s) => s.vm);
  const platterRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrub = useRef<{ x: number; offset: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      const el = platterRef.current;
      const t = turntablePlayer();
      const now = getEngine().ctx.currentTime;
      if (el) {
        const p = t.progress(now);
        el.style.transform = `rotate(${Math.round(p * TURNS * 360)}deg)`;
      }
      if (timeRef.current) timeRef.current.textContent = fmtTime(t.offsetAt(now));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPlatterDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = turntablePlayer();
    scrub.current = { x: e.clientX, offset: t.offsetAt(getEngine().ctx.currentTime) };
  };
  const onPlatterMove = (e: PointerEvent<HTMLDivElement>): void => {
    const s = scrub.current;
    const t = turntablePlayer();
    if (!s || t.duration === 0) return;
    const sens = (t.duration / (platterRef.current?.clientWidth ?? 160)) * 1.4;
    useTurntable.getState().seek(s.offset + (e.clientX - s.x) * sens);
  };
  const onPlatterUp = (): void => { scrub.current = null; };

  const loadCell = (): void => {
    const sel = useGrid.getState().selected;
    if (!sel) { toast.error('Select a grid cell first'); return; }
    void useTurntable.getState().loadFromCell(sel);
  };

  const rate = vm.rate;
  const pitchPct = Math.round((rate - 1) * 100 + 0.6);

  return (
    <section className="tt skin-sl1200">
      <div className="tt__top">
        <Nameplate model="SL-1200MK5" name="TURNTABLE · VINYL" />
        <div className="tt__lcd">
          <span className="tt__lcd-rpm">{rate >= 0.9 && rate <= 1.1 ? '33' : '45'}</span>
          <span className="tt__lcd-tone">{vm.state === 'spinning' ? '▶' : '▌'}</span>
          <span className="tt__lcd-time" ref={timeRef}>{fmtTime(0)}</span>
        </div>
      </div>

      <div className="tt__body">
        <div className="tt__platter-zone">
          <div
            ref={platterRef}
            className="tt__platter"
            onPointerDown={onPlatterDown}
            onPointerMove={onPlatterMove}
            onPointerUp={onPlatterUp}
            onPointerCancel={onPlatterUp}
          >
            <div className="tt__record">
              <div className="tt__record-label" />
              <div className="tt__record-grooves" />
              <span className="tt__tongue" />
            </div>
            <div className="tt__spindle" />
          </div>
          <div className="tt__tonearm" />
          <div className="tt__prob">
            <span className="tt__prob-label">NEEDLE</span>
            <span className="tt__prob-value">{vm.name}</span>
          </div>
        </div>

        <div className="tt__side">
          <div className="tt__pitch">
            <span className="tt__silk">PITCH</span>
            <div className="tt__pitch-scale">
              <Fader
                orientation="vertical"
                value={(rate - 0.5) / (1.6 - 0.5)}
                onChange={(v) => useTurntable.getState().setRate(0.5 + v * (1.6 - 0.5))}
                label="temp"
                step={0.01}
                fmt={(v) => `${Math.round((0.5 + v * 1.1 - 1) * 100)}%`}
              />
              <span className="tt__pitch-pct">{pitchPct > 0 ? `+${pitchPct}` : pitchPct}%</span>
            </div>
          </div>

          <div className="tt__rpm-btns">
            <button className={`hw-seg-btn${rate >= 0.9 && rate <= 1.1 ? ' is-on' : ''}`} onClick={() => useTurntable.getState().setRate(1)}>33</button>
            <button className={`hw-seg-btn${rate < 0.9 || rate > 1.1 ? ' is-on' : ''}`} onClick={() => useTurntable.getState().setRate(1.36)}>45</button>
          </div>

          <button
            className={`tt__start${vm.state === 'spinning' ? ' is-on' : ''}`}
            onClick={() => (vm.state === 'spinning' ? useTurntable.getState().stop() : useTurntable.getState().spin())}
            disabled={vm.state === 'empty'}
            title={vm.state === 'spinning' ? 'Stop the platter' : 'Spin the record'}
          >
            {vm.state === 'spinning' ? '❚❚' : '▶'}
          </button>

          <div className="tt__load">
            <button className="hw-seg-btn" onClick={loadCell} title="Load the selected cell">⧉ Cell</button>
            <button className="hw-seg-btn" onClick={() => fileRef.current?.click()} title="Load a WAV file">⇪</button>
            <input ref={fileRef} type="file" accept="audio/wav,audio/x-wav,.wav" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void useTurntable.getState().loadFile(f); e.target.value = ''; }} />
          </div>

          <div className="tt__level">
            <Fader orientation="horizontal" value={vm.gain} onChange={(v) => useTurntable.getState().setGain(v)} label="vol" step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </div>
      </div>
    </section>
  );
}