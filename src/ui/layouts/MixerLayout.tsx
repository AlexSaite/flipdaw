import { LayoutNav } from './LayoutNav';
import { MixerStrips } from '../components/MixerStrips';

/** Mixer layout: one horizontal strip per track with fader, pan, M/S, meter. */
export function MixerLayout() {
  return (
    <div className="mixer">
      <LayoutNav />
      <MixerStrips />
    </div>
  );
}