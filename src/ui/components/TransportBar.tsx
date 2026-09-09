import { useTransport } from '../../store/transport';
import { useGrid } from '../../store/project';
import { BPM_MIN, BPM_MAX, type Quantize } from '../../audio/transport';

const Q: Quantize[] = ['off', '1/4', '1/2', '1bar', '2bar'];

export function TransportBar() {
  const playing = useTransport((s) => s.playing);
  const bpm = useTransport((s) => s.bpm);
  const togglePlay = useTransport((s) => s.togglePlay);
  const setBpm = useTransport((s) => s.setBpm);
  const quantize = useGrid((s) => s.quantize);
  const setQuantize = useGrid((s) => s.setQuantize);

  return (
    <header className="transport">
      <button className="transport__play" onClick={togglePlay}>
        {playing ? '■' : '▶'}
      </button>
      <label className="transport__bpm">
        BPM
        <input type="range" min={BPM_MIN} max={BPM_MAX} value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))} />
        <span className="transport__val">{bpm}</span>
      </label>
      <label className="transport__q">
        Q
        <select value={quantize} onChange={(e) => setQuantize(e.target.value as Quantize)}>
          {Q.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
    </header>
  );
}
