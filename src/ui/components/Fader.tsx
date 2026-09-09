import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

type FaderOrientation = 'vertical' | 'horizontal';

interface FaderProps {
  value: number;       // 0..1
  onChange(v: number): void;
  orientation?: FaderOrientation;
  label?: string;
}

/** Multi-touch safe fader: each pointer is captured to its own element,
 *  so 10 fingers on 10 faders never conflict. */
export function Fader({ value, onChange, orientation = 'vertical', label }: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const lastValue = useRef(value);

  useEffect(() => { lastValue.current = value; }, [value]);

  const valueFromEvent = useCallback((clientX: number, clientY: number): number => {
    const el = trackRef.current;
    if (!el) return lastValue.current;
    const rect = el.getBoundingClientRect();
    if (orientation === 'vertical') {
      const ratio = 1 - (clientY - rect.top) / rect.height;
      return Math.min(1, Math.max(0, ratio));
    }
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(1, Math.max(0, ratio));
  }, [orientation]);

  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activeId.current = e.pointerId;
    onChange(valueFromEvent(e.clientX, e.clientY));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (activeId.current !== e.pointerId) return;
    onChange(valueFromEvent(e.clientX, e.clientY));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (activeId.current === e.pointerId) activeId.current = null;
  };

  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const clamp = orientation === 'vertical'
    ? { bottom: `${pct}%` }
    : { left: `${pct}%` };
  const fillStyle = orientation === 'vertical'
    ? { height: `${pct}%` }
    : { width: `${pct}%` };

  return (
    <div className={`fader fader--${orientation}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div ref={trackRef} className="fader__track" data-value={pct}>
        <div className="fader__fill" style={fillStyle} />
        <div className="fader__thumb" style={clamp} />
      </div>
      {label && <span className="fader__label">{label}</span>}
    </div>
  );
}