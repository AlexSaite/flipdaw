import { DbMeter } from './DbMeter';
import { useGrid } from '../../store/project';

interface MeterProps {
  trackId: string;
  vertical?: boolean;
}

/** Track peak meter: three-colour PPM bar + hold line (ГОСТ Р МЭК 60268-18).
 *  Reads the strip analyser once per rAF — UI thread, never the audio path. */
export function Meter({ trackId, vertical = true }: MeterProps) {
  return <DbMeter vertical={vertical} read={() => useGrid.getState().meter(trackId)} />;
}