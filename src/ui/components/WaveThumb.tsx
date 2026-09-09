import { useEffect, useRef } from 'react';
import { useGrid } from '../../store/project';
import { drawPeaks } from '../../project/thumbs';

interface WaveThumbProps {
  cellId: string;
  color?: string;
}

/** Canvas waveform drawn from cached peaks. */
export function WaveThumb({ cellId, color = '#14b8a6' }: WaveThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const peaks = useGrid.getState().cells[cellId]?.peaks;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    ctx.scale(dpr, dpr);
    if (peaks) drawPeaks(ctx, peaks, clientWidth, clientHeight, color);
    else {
      ctx.clearRect(0, 0, clientWidth, clientHeight);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 0, clientWidth, clientHeight);
    }
  }, [cellId, color]);

  return <canvas ref={canvasRef} className="wavethumb" aria-hidden />;
}
