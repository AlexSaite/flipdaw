/** M0: demo loops synthesized in code — no binaries in the repo.
 *  4 tracks x 4 scenes, 1 bar @120, variations per scene. */

const BPM = 120;
const BAR_SEC = (60 / BPM) * 4;
const SR = 44100;
type Ctx = OfflineAudioContext;

function kick(ctx: Ctx, t: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + 0.3);
}

function noiseBuf(ctx: Ctx): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(SR * 0.5), SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function hat(ctx: Ctx, t: number): void {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  s.connect(f); f.connect(g); g.connect(ctx.destination);
  s.start(t); s.stop(t + 0.08);
}

function snare(ctx: Ctx, t: number): void {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  s.connect(f); f.connect(g); g.connect(ctx.destination);
  s.start(t); s.stop(t + 0.2);
}

function bassNote(ctx: Ctx, t: number, freq: number, dur: number): void {
  const o = ctx.createOscillator();
  o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

function pad(ctx: Ctx, t: number, freqs: number[], dur: number): void {
  for (const fr of freqs) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr; o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.15);
      g.gain.setValueAtTime(0.12, t + Math.max(0.2, dur - 0.2));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
}

const CHORDS: number[][] = [
  [220.0, 261.63, 329.63],  // Am
  [174.61, 220.0, 261.63],  // F
  [261.63, 329.63, 392.0],  // C
  [196.0, 246.94, 293.66],  // G
];
const BASS_ROOT = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1

export async function renderDemoLoops(): Promise<Record<string, AudioBuffer[]>> {
  const out: Record<string, AudioBuffer[]> = {};
  for (const tr of ['drums', 'bass', 'synth', 'keys']) {
    out[tr] = [];
    for (let scene = 0; scene < 4; scene++) out[tr].push(await renderBar(tr, scene));
  }
  return out;
}

async function renderBar(track: string, scene: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * BAR_SEC), SR);
  const step = BAR_SEC / 16;

  if (track === 'drums') {
    for (let s = 0; s < 16; s++) {
      const t = s * step;
      if (s % (scene === 1 ? 8 : 4) === 0) kick(ctx, t);
      if (scene >= 1 && s % 2 === 0) hat(ctx, t);
      if (scene >= 2 && (s === 4 || s === 12)) snare(ctx, t);
      if (scene === 3 && s === 14) snare(ctx, t);
    }
  } else if (track === 'bass') {
    const root = BASS_ROOT[scene];
    const hits = scene === 0 ? [0, 8] : scene === 1 ? [0, 6, 8] : scene === 2 ? [0, 4, 8, 12] : [0, 3, 8, 11];
    for (const h of hits) bassNote(ctx, h * step, root, step * (scene === 0 ? 3 : 1.5));
  } else if (track === 'synth') {
    const ch = CHORDS[scene].map((f) => f * 2);
    const stabs = scene === 0 ? [0] : scene === 1 ? [0, 10] : scene === 2 ? [0, 6, 10] : [2, 6, 10, 14];
    for (const st of stabs) pad(ctx, st * step, ch, step * 2);
  } else {
    pad(ctx, 0, CHORDS[scene], BAR_SEC);
  }
  return ctx.startRendering();
}
