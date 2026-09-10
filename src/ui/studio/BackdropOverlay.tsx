import { useEffect, type PointerEvent, type ReactNode } from 'react';

interface BackdropOverlayProps {
  onClose(): void;
  children: ReactNode;
  /** Side panel (right) for mixer/master, centered sheet for dialogs (§4). */
  align?: 'right' | 'center';
}

/** Translucent secondary-panel shell (UI-REDESIGN §4): closes on tap outside
 *  the panel or on Escape; the workspace underneath stays visible & audible. */
export function BackdropOverlay({ onClose, children, align = 'right' }: BackdropOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onBackdrop = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={`overlay-backdrop overlay-backdrop--${align}`} onPointerDown={onBackdrop}>
      <section className="overlay" role="dialog" aria-modal="true">
        {children}
      </section>
    </div>
  );
}