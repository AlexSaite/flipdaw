import { create } from 'zustand';
import { getEngine } from '../audio/engine';

interface TransportStore {
  playing: boolean;
  bpm: number;
  togglePlay(): void;
  setBpm(b: number): void;
}

export const useTransport = create<TransportStore>((_set) => ({
  playing: false,
  bpm: 120,
  togglePlay: () => {
    const e = getEngine();
    if (e.transport.playing) e.panic();
    else e.transport.start();
  },
  setBpm: (b) => { getEngine().transport.setBpm(b); },
}));

/** Subscribe UI store to engine events. Returns unsub. */
export function subscribeTransportToEngine(): () => void {
  return getEngine().transport.subscribe((s) =>
    useTransport.setState({ playing: s.playing, bpm: s.bpm }));
}
