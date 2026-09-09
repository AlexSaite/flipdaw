/**
 * FlipDAW — deck bus + constant-power crossfader (M6.3).
 * Deck chain: input → lowshelf(250 Hz) → peaking(1 kHz) → highshelf(4 kHz)
 *           → level → cross → mix → dest.
 * EQ gain is linear amplitude 10^(dB/20), clamped to ±12 dB. Decks sync
 * 1:1 to the transport grid — no time-stretch (ADR-012).
 */

export const EQ_BANDS = ['low', 'mid', 'high'] as const;
export type EqBand = (typeof EQ_BANDS)[number];

export const EQ_RANGE_DB = 12;
export const LOW_FREQ = 250;
export const MID_FREQ = 1000;
export const HIGH_FREQ = 4000;
export const MID_Q = 1;
export const DECK_LEVEL = 0.85;

/** ±12 dB clamp → linear amplitude. */
export function eqAmplitude(db: number): number {
  return 10 ** (Math.min(EQ_RANGE_DB, Math.max(-EQ_RANGE_DB, db)) / 20);
}

/** Constant-power crossfader pair: 0 → only A, 1 → only B, 0.5 → −3 dB each. */
export function crossfadeGains(v: number): [number, number] {
  const x = Math.min(1, Math.max(0, v)) * (Math.PI / 2);
  return [Math.cos(x), Math.sin(x)];
}

export interface DeckBus {
  readonly input: GainNode;
  /** EQ band level in dB (clamped ±12). */
  setEq(band: EqBand, db: number): void;
  bandGain(band: EqBand): number;
  setLevel(v: number): void;
  /** This deck's crossfader gain (0…1). */
  setCross(v: number): void;
  crossGain(): number;
  dispose(): void;
}

export interface DeckMixer {
  readonly deckA: DeckBus;
  readonly deckB: DeckBus;
  /** 0 = only A … 1 = only B. */
  crossfade(v: number): void;
  getCross(): number;
}

export function createDeckMixer(ctx: AudioContext, dest: AudioNode): DeckMixer {
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(dest);
  let pos = 0.5;

  function bandOf(band: EqBand, f: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode]) {
    return band === 'low' ? f[0] : band === 'mid' ? f[1] : f[2];
  }

  function makeDeck(): DeckBus {
    const input = ctx.createGain();
    input.gain.value = 1;
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = LOW_FREQ;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = MID_FREQ;
    mid.Q.value = MID_Q;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = HIGH_FREQ;
    const level = ctx.createGain();
    level.gain.value = DECK_LEVEL;
    const cross = ctx.createGain();
    cross.gain.value = 1;
    input.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(level);
    level.connect(cross);
    cross.connect(mix);
    return {
      input,
      setEq(band, db) {
        bandOf(band, [low, mid, high]).gain.setTargetAtTime(eqAmplitude(db), ctx.currentTime, 0.01);
      },
      bandGain(band) { return bandOf(band, [low, mid, high]).gain.value; },
      setLevel(v) {
        level.gain.setTargetAtTime(Math.min(1, Math.max(0, v)), ctx.currentTime, 0.01);
      },
      setCross(v) {
        cross.gain.setValueAtTime(Math.min(1, Math.max(0, v)), ctx.currentTime);
      },
      crossGain: () => cross.gain.value,
      dispose() {
        input.disconnect();
        low.disconnect(); mid.disconnect(); high.disconnect();
        level.disconnect(); cross.disconnect();
      },
    };
  }

  const deckA = makeDeck();
  const deckB = makeDeck();
  const crossfade = (v: number): void => {
    pos = Math.min(1, Math.max(0, v));
    const [a, b] = crossfadeGains(pos);
    deckA.setCross(a);
    deckB.setCross(b);
  };
  crossfade(0.5);

  return {
    deckA,
    deckB,
    crossfade,
    getCross: () => pos,
  };
}