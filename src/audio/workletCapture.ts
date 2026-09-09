/**
 * FlipDAW — mic capture via a blob-URL AudioWorklet (ADR-008).
 * The worklet posts raw mono sample blocks; we accumulate them and assemble
 * an AudioBuffer trimmed to the recorder's [startAt, stopAt) window. The
 * ~1-block (128-sample) edge error at each end is below audible threshold for
 * loop recording; loop length still snaps to exact bars via the recorder.
 */

import type { Capturer } from './recorder';
import { samplesOf } from './buffers';
import type { Seconds } from './transport';

const BLOCK = 128;

const WORKLET_SOURCE = `
class FlipDawCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;
    const ch0 = input[0];
    const copy = new Float32Array(ch0.length);
    copy.set(ch0);
    this.port.postMessage({ chunk: copy }, [copy.buffer]);
    return true;
  }
}
registerProcessor('flipDaw-capture', FlipDawCaptureProcessor);
`;

let moduleUrl: string | null = null;

function captureModuleUrl(): string {
  if (!moduleUrl) {
    moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
  }
  return moduleUrl;
}

export interface WorkletCaptureOptions {
  ctx: AudioContext;
  /** Node feeding the capture (e.g. MediaStreamAudioSourceNode from the mic). */
  input: AudioNode;
  sampleRate?: number;
}

/** Browser-only mic capture, implementing the recorder's `Capturer`. */
export class WorkletCapture implements Capturer {
  /** Initialize worklet (async: addModule + connection). */
  static async create(opts: WorkletCaptureOptions): Promise<WorkletCapture> {
    await opts.ctx.audioWorklet.addModule(captureModuleUrl());
    const node = new AudioWorkletNode(opts.ctx, 'flipDaw-capture', {
      numberOfInputs: 1, numberOfOutputs: 0,
    });
    opts.input.connect(node);
    return new WorkletCapture(opts, node);
  }

  private readonly ctx: AudioContext;
  private readonly node: AudioWorkletNode;
  private readonly sampleRate: number;

  private chunks: Float32Array[] = [];
  private total = 0;
  private startAt: Seconds | null = null;
  private pending: { resolve: (b: AudioBuffer) => void; length: number } | null = null;

  private constructor(opts: WorkletCaptureOptions, node: AudioWorkletNode) {
    this.ctx = opts.ctx;
    this.node = node;
    this.sampleRate = opts.sampleRate ?? opts.ctx.sampleRate;
    this.node.port.onmessage = (e: MessageEvent<{ chunk?: Float32Array }>) => {
      const chunk = e.data?.chunk;
      if (chunk && chunk.length > 0) {
        this.chunks.push(chunk);
        this.total += chunk.length;
      }
    };
  }

  start(at: Seconds): void {
    this.startAt = at;
    this.chunks = [];
    this.total = 0;
    this.pending = null;
  }

  stop(at: Seconds): Promise<AudioBuffer> {
    if (this.startAt === null) return Promise.reject(new Error('worklet capture not recording'));
    const length = samplesOf(Math.max(0, at - this.startAt), this.sampleRate);
    const stopAt = at;
    return new Promise<AudioBuffer>((resolve) => {
      this.pending = { resolve, length };

      const timer = window.setInterval(() => {
        if (this.ctx.currentTime >= stopAt + BLOCK / this.sampleRate) {
          window.clearInterval(timer);
          this.finish(length);
        }
      }, 10);
    });
  }

  dispose(): void {
    this.node.disconnect();
    this.pending = null;
  }

  private finish(length: number): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.resolve(this.assemble(length));
  }

  /** Keep the trailing `length` samples (end aligned to the stop boundary). */
  private assemble(length: number): AudioBuffer {
    const buf = this.ctx.createBuffer(1, length, this.sampleRate);
    const out = buf.getChannelData(0);
    let cursor = length - 1;
    for (let c = this.chunks.length - 1; c >= 0 && cursor >= 0; c--) {
      const ch = this.chunks[c];
      for (let i = ch.length - 1; i >= 0 && cursor >= 0; i--) {
        out[cursor] = ch[i];
        cursor--;
      }
    }
    return buf;
  }
}