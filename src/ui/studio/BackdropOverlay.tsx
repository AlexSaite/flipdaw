import { useEffect, type PointerEvent, type ReactNode } from 'react';

interface BackdropOverlayProps {
  onClose(): void;
  children: ReactNode;
}

/** Translucent secondary-panel shell (UI-REDESIGN §4): closes on tap outside
 *  the panel or on Escape; the workspace underneath stays visible & audible. */
export function BackdropOverlay({ onClose, children }: BackdropOverlayProps) {
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
    <div className="overlay-backdrop" onPointerDown={onBackdrop}>
      <section className="overlay" role="dialog" aria-modal="true">
        {children}
      </section>
    </div>
  );
}