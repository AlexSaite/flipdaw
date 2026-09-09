/**
 * FlipDAW — EQ calibration (M5).
 * Parses REW measurements, fits per-octave flattening bands, and hands the
 * chain over to the audio graph. ADR-011: presets are placeholders until we
 * replace them with our own REW measurement of the Spectre x360 speakers.
 */

export interface EqBand {
  freq: number; // Hz, band center
  gainDb: number;
  q: number;
}

/** Octave band centers from 31.5 Hz to 16 kHz (10 bands). */
export const OCTAVE_BAND_HZ = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Measured magnitude response (freq/mag aligned, ascending freq). */
export interface MeasuredResponse {
  freqs: number[];
  magsDb: number[];
}

const NUM_RE = /^\s*-?\d+(?:[.,]\d+)?/;

/**
 * Parse a REW "Spl or Radian" / FR export into frequency + magnitude (dB).
 * Tolerates tab/space separation, a comma decimal separator, and skips any
 * non-numeric header rows. Only the 20 Hz – 20 kHz window is kept.
 */
export function parseRewTxt(text: string): MeasuredResponse {
  const freqs: number[] = [];
  const magsDb: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = NUM_RE.exec(line);
    if (!m) continue;
    const tokens = line.split(/\s+/);
    const f = Number.parseFloat(tokens[0].replace(',', '.'));
    if (!Number.isFinite(f) || f <= 0) continue;
    if (f < 20 || f > 20000) continue;
    const magTok = tokens.slice(1).find((t) => NUM_RE.test(t));
    if (magTok === undefined) continue;
    const mag = Number.parseFloat(magTok.replace(',', '.'));
    if (!Number.isFinite(mag)) continue;
    freqs.push(f);
    magsDb.push(mag);
  }
  // sort ascending by frequency (measurements may come out of order)
  const idx = freqs.map((_, i) => i).sort((a, b) => freqs[a] - freqs[b]);
  return { freqs: idx.map((i) => freqs[i]), magsDb: idx.map((i) => magsDb[i]) };
}

/** Average magnitude in [center/√2, center·√2] (None when no sample in band). */
export function bandAverage(m: MeasuredResponse, center: number): number | null {
  const lo = center / Math.SQRT2;
  const hi = center * Math.SQRT2;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < m.freqs.length; i++) {
    if (m.freqs[i] >= lo && m.freqs[i] <= hi) { sum += m.magsDb[i]; n++; }
  }
  return n > 0 ? sum / n : null;
}

/**
 * Fit peaking EQ bands that flatten a measured response to 0 dB on the
 * octave grid. The response is first centred on its median so EQ gains stay
 * practical — we fix the SHAPE, not the absolute SPL.
 * Gain = -(band average); bands without a sample are dropped.
 */
export function fitEq(magsDb: number[], freqs: number[]): EqBand[] {
  const sorted = [...magsDb].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  const m: MeasuredResponse = { freqs, magsDb: magsDb.map((db) => db - median) };
  const bands: EqBand[] = [];
  for (const center of OCTAVE_BAND_HZ) {
    const avg = bandAverage(m, center);
    if (avg === null) continue;
    const gainDb = -avg;
    if (Math.abs(gainDb) < 0.35) continue; // negligible — skip to save CPU
    bands.push({ freq: center, gainDb, q: 1.0 });
  }
  return bands;
}

/** Insertable EQ: `input -> biquad... -> output`, rebuildable in place. */
export interface EqChain {
  readonly input: AudioNode;
  readonly output: AudioNode;
  setBands(bands: EqBand[]): void;
  dispose(): void;
}

/**
 * Create a peaking-filter chain. Caller wires master -> eq.input and
 * eq.output -> the next stage (or destination). `setBands` rebuilds in place.
 */
export function applyEq(ctx: AudioContext, bands: EqBand[]): EqChain {
  let input = ctx.createGain();
  let output = ctx.createGain();
  let filters: BiquadFilterNode[] = [];

  function wire(): void {
    input.disconnect();
    if (filters.length === 0) { input.connect(output); return; }
    let prev: AudioNode = input;
    for (const f of filters) { prev.connect(f); prev = f; }
    prev.connect(output);
  }

  function build(next: EqBand[]): void {
    for (const f of filters) f.disconnect();
    filters = next.filter((b) => Math.abs(b.gainDb) > 0).map((b) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = b.gainDb;
      return f;
    });
    wire();
  }

  build(bands);
  return {
    get input() { return input; },
    get output() { return output; },
    setBands(next: EqBand[]) { build(next); },
    dispose() {
      for (const f of filters) f.disconnect();
      filters = [];
      input.disconnect();
      output.disconnect();
    },
  };
}