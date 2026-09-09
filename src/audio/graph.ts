/**
 * FlipDAW — audio graph: track strip and master bus.
 * Chain: clipSource -> clipGain -> strip(input->gain->pan->mute) -> master
 *        master -> limiter -> destination
 *        master -> splitter -> analyserL/analyserR (peaks for UI)
 *        reverb (send bus) input <- strips; reverb output -> masterGain
 */

import { createReverbBus, type ReverbBus } from './reverb';

export interface TrackStrip {
  readonly input: GainNode;
  setGain(v: number): void;    // 0..1
  setPan(v: number): void;     // -1..1
  setMute(m: boolean): void;
  meter(): number;             // peak 0..1
  dispose(): void;
}

export interface MasterBus {
  setGain(v: number): void;
  /** Peaks [L, R] 0..1; call from rAF. */
  meter(): [number, number];
}

export interface AudioGraph {
  readonly ctx: AudioContext;
  createStrip(): TrackStrip;
  /** Create a send-reverb bus whose output is wired to the master bus. */
  createReverb(impulse: AudioBuffer): ReverbBus;
  readonly master: MasterBus;
}

export function createAudioGraph(ctx: AudioContext): AudioGraph {
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;

  // Brickwall limiter: fast compressor on master
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  // Meters: splitter + two analysers (per channel)
  const splitter = ctx.createChannelSplitter(2);
  const anL = ctx.createAnalyser();
  const anR = ctx.createAnalyser();
  anL.fftSize = 512; anR.fftSize = 512;
  anL.smoothingTimeConstant = 0.6; anR.smoothingTimeConstant = 0.6;
  masterGain.connect(splitter);
  splitter.connect(anL, 0);
  splitter.connect(anR, 1);
  const bufL = new Float32Array(anL.fftSize);
  const bufR = new Float32Array(anR.fftSize);

  const master: MasterBus = {
    setGain(v: number) { masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.01); },
    meter(): [number, number] {
      anL.getFloatTimeDomainData(bufL);
      anR.getFloatTimeDomainData(bufR);
      let l = 0, r = 0;
      for (let i = 0; i < bufL.length; i++) {
        const a = Math.abs(bufL[i]), b = Math.abs(bufR[i]);
        if (a > l) l = a;
        if (b > r) r = b;
      }
      return [l, r];
    },
  };

  function createStrip(): TrackStrip {
    const input = ctx.createGain();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const mute = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    const buf = new Float32Array(analyser.fftSize);
    gain.gain.value = 0.9;
    input.connect(gain); gain.connect(pan); pan.connect(mute);
    mute.connect(masterGain);
    mute.connect(analyser);
    return {
      input,
      setGain: (v) => { gain.gain.setTargetAtTime(v, ctx.currentTime, 0.01); },
      setPan: (v) => { pan.pan.setTargetAtTime(v, ctx.currentTime, 0.01); },
      setMute: (m) => { mute.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.01); },
      meter: () => {
        analyser.getFloatTimeDomainData(buf);
        let p = 0;
        for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
        return p;
      },
      dispose: () => { input.disconnect(); gain.disconnect(); pan.disconnect(); mute.disconnect(); analyser.disconnect(); },
    };
  }

  function createReverb(impulse: AudioBuffer): ReverbBus {
    const bus = createReverbBus(ctx, impulse);
    bus.output.connect(masterGain);
    return bus;
  }

  return { ctx, createStrip, createReverb, master };
}
