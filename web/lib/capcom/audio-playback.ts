import { CAPCOM_OUTPUT_SAMPLE_RATE } from './config';

const PREBUFFER_MS = 120;
const MAX_WAIT_MS = 130;

export const PLAYER_WORKLET = `
class CapcomPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const settings = options.processorOptions
    this.prebuffer = Math.round(sampleRate * settings.prebufferMs / 1000)
    this.maxWait = Math.round(sampleRate * settings.maxWaitMs / 1000)
    this.chunks = []
    this.offset = 0
    this.queued = 0
    this.playing = false
    this.waited = 0
    this.played = 0
    this.sumSquares = 0
    this.sinceReport = 0
    this.port.onmessage = (message) => {
      const data = message.data
      if (data.type === 'audio') {
        this.chunks.push(data.samples)
        this.queued += data.samples.length
        this.waited = 0
      } else if (data.type === 'clear') {
        this.chunks = []
        this.offset = 0
        this.queued = 0
        this.playing = false
      }
    }
  }
  process(inputs, outputs) {
    const out = outputs[0][0]
    if (!this.playing && this.queued > 0) {
      this.waited += out.length
      if (this.queued >= this.prebuffer || this.waited >= this.maxWait) this.playing = true
    }
    let filled = 0
    if (this.playing) {
      while (filled < out.length && this.chunks.length > 0) {
        const chunk = this.chunks[0]
        const count = Math.min(out.length - filled, chunk.length - this.offset)
        for (let i = 0; i < count; i++) {
          const v = chunk[this.offset + i]
          out[filled + i] = v
          this.sumSquares += v * v
        }
        filled += count
        this.offset += count
        this.queued -= count
        if (this.offset >= chunk.length) {
          this.chunks.shift()
          this.offset = 0
        }
      }
      if (this.chunks.length === 0) {
        this.playing = false
        this.waited = 0
        this.port.postMessage({ type: 'drained' })
      }
    }
    for (let i = filled; i < out.length; i++) out[i] = 0
    this.played += filled
    this.sinceReport += out.length
    if (this.sinceReport >= 4096) {
      this.port.postMessage({ type: 'stats', played: this.played, sumSquares: this.sumSquares, queued: this.queued })
      this.sinceReport = 0
    }
    return true
  }
}
registerProcessor('capcom-player', CapcomPlayer)
`;

export interface PlayerStats {
  contextState: AudioContextState | 'idle'
  playedSamples: number
  queuedSamples: number
  rms: number
}

export interface PcmPlayerOptions {
  sampleRate?: number
  prebufferMs?: number
}

/** Cola de reproducción PCM16 sin cortes sobre un AudioWorklet; clear() descarta lo encolado (interrupción). */
export class PcmPlayer {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private played = 0;
  private sumSquares = 0;
  private queued = 0;
  private readonly drainListeners = new Set<() => void>();
  private readonly sampleRate: number;
  private readonly prebufferMs: number;

  constructor(options: PcmPlayerOptions = {}) {
    this.sampleRate = options.sampleRate ?? CAPCOM_OUTPUT_SAMPLE_RATE;
    this.prebufferMs = options.prebufferMs ?? PREBUFFER_MS;
  }

  async start(): Promise<void> {
    if (this.context) return;
    const context = new AudioContext({ sampleRate: this.sampleRate });
    this.context = context;
    const url = URL.createObjectURL(new Blob([PLAYER_WORKLET], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, 'capcom-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { prebufferMs: this.prebufferMs, maxWaitMs: MAX_WAIT_MS },
    });
    node.port.onmessage = (message: MessageEvent<{ type: string; played?: number; sumSquares?: number; queued?: number }>) => {
      const data = message.data;
      if (data.type === 'stats') {
        this.played = data.played ?? 0;
        this.sumSquares = data.sumSquares ?? 0;
        this.queued = data.queued ?? 0;
      } else if (data.type === 'drained') {
        for (const listener of this.drainListeners) listener();
      }
    };
    node.connect(context.destination);
    this.node = node;
    await context.resume();
  }

  enqueue(pcm: Int16Array) {
    if (!this.node) return;
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
    this.node.port.postMessage({ type: 'audio', samples }, [samples.buffer]);
  }

  clear() {
    this.node?.port.postMessage({ type: 'clear' });
  }

  onDrain(listener: () => void): () => void {
    this.drainListeners.add(listener);
    return () => this.drainListeners.delete(listener);
  }

  getStats(): PlayerStats {
    return {
      contextState: this.context?.state ?? 'idle',
      playedSamples: this.played,
      queuedSamples: this.queued,
      rms: this.played > 0 ? Math.sqrt(this.sumSquares / this.played) : 0,
    };
  }

  async close(): Promise<void> {
    if (this.node) this.node.port.onmessage = null;
    this.node?.disconnect();
    this.node = null;
    const context = this.context;
    this.context = null;
    await context?.close().catch(() => undefined);
  }
}
