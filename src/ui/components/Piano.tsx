import { type PointerEvent } from 'react';
import { usePiano } from '../../store/piano';
import { PianoModel, noteLabel, OCTAVE_MIN, OCTAVE_MAX } from '../../piano/model';
import { Nameplate } from './Nameplate';

/**
 * Touch piano (M6.1). Two octaves per screen, octave ± chips, sustain.
 * ADR-013: velocity comes from the press zone of the key — bottom half is
 * accented (forte), top half soft (piano); no pressure/stylus required.
 * Scheduling happens on pointerdown with ctx.currentTime (ADR-001) — the
 * piano is a live instrument, not transport-quantized.
 */
export function Piano() {
  const octave = usePiano((s) => s.octave);
  const held = usePiano((s) => s.held);
  const sustain = usePiano((s) => s.sustain);
  const noteOn = usePiano((s) => s.noteOn);
  const noteOff = usePiano((s) => s.noteOff);
  const setOctave = usePiano((s) => s.setOctave);
  const setSustain = usePiano((s) => s.setSustain);

  const model = new PianoModel(octave);
  const naturals = model.naturals();
  const accidentals = model.accidentals();
  const n = naturals.length;
  const blackW = (100 / n) * 0.62;

  const velocity = (e: PointerEvent<HTMLButtonElement>): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientY - r.top) / r.height >= 0.5 ? 1 : 0.72;
  };
  const down = (midi: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    noteOn(midi, velocity(e));
  };
  const up = (midi: number) => () => noteOff(midi);

  return (
    <section className="piano skin-vl1">
      <div className="piano__head">
        <Nameplate model="VL-1" name="MONO KEYS" />
        <button
          className="transport__step"
          onClick={() => setOctave(octave - 1)}
          disabled={octave <= OCTAVE_MIN}
          title="Octave down"
        >
          −
        </button>
        <span className="transport__val transport__val--big">C{octave}</span>
        <button
          className="transport__step"
          onClick={() => setOctave(octave + 1)}
          disabled={octave >= OCTAVE_MAX}
          title="Octave up"
        >
          +
        </button>
        <span className="seq__divider" />
        <button
          className={`seg-btn${sustain ? ' is-on' : ''}`}
          onClick={() => setSustain(!sustain)}
          title="Sustain: released keys keep ringing"
        >
          Hold
        </button>
      </div>

      <div className="piano__keys">
        {naturals.map((midi, i) => (
          <button
            key={midi}
            className={`piano__white${held.has(midi) ? ' is-on' : ''}`}
            onPointerDown={down(midi)}
            onPointerUp={up(midi)}
            onPointerLeave={up(midi)}
            onPointerCancel={up(midi)}
            onContextMenu={(e) => e.preventDefault()}
            title={noteLabel(midi)}
          >
            {i % 7 === 0 && <span className="piano__oct">{noteLabel(midi)}</span>}
          </button>
        ))}
        {accidentals.map((a) => (
          <button
            key={a.midi}
            className={`piano__black${held.has(a.midi) ? ' is-on' : ''}`}
            style={{ left: `calc(${(a.whiteAfter / n) * 100}% - ${blackW / 2}%)`, width: `${blackW}%` }}
            onPointerDown={down(a.midi)}
            onPointerUp={up(a.midi)}
            onPointerLeave={up(a.midi)}
            onPointerCancel={up(a.midi)}
            onContextMenu={(e) => e.preventDefault()}
            title={noteLabel(a.midi)}
          />
        ))}
      </div>
    </section>
  );
}