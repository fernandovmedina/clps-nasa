import { CAPCOM_INPUT_SAMPLE_RATE } from './config';

const FRAME_SAMPLES = 512;

export const CAPTURE_WORKLET = `
class CapcomCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / ${CAPCOM_INPUT_SAMPLE_RATE}
    this.frame = new Int16Array(${FRAME_SAMPLES})
    this.length = 0
    this.sum = 0
    this.phase = 0
  }
  emit(value) {
    const clamped = Math.max(-1, Math.min(1, value))
    this.frame[this.length++] = clamped < 0 ? clamped * 32768 : clamped * 32767
    if (this.length === this.frame.length) {
      this.port.postMessage(this.frame.buffer, [this.frame.buffer])
      this.frame = new Int16Array(${FRAME_SAMPLES})
      this.length = 0
    }
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i++) {
      let remaining = 1
      while (remaining > 1e-9) {
        const take = Math.min(remaining, this.ratio - this.phase)
        this.sum += channel[i] * take
        this.phase += take
        remaining -= take
        if (this.phase >= this.ratio - 1e-9) {
          this.emit(this.sum / this.ratio)
          this.sum = 0
          this.phase = 0
        }
      }
    }
    return true
  }
}
registerProcessor('capcom-capture', CapcomCapture)
`;

export interface MicrophoneCapture {
  stop: () => Promise<void>
}

/** Entrega tramas PCM16 mono de 32 ms a 16 kHz; el worklet remuestrea si el contexto no admite 16 kHz. */
export async function startMicrophoneCapture(onFrame: (pcm: Int16Array) => void): Promise<MicrophoneCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: CAPCOM_INPUT_SAMPLE_RATE });
  } catch {
    context = new AudioContext();
  }

  try {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'capcom-capture', { numberOfInputs: 1, numberOfOutputs: 1 });
    node.port.onmessage = (message: MessageEvent<ArrayBuffer>) => onFrame(new Int16Array(message.data));
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(node);
    node.connect(sink);
    sink.connect(context.destination);
    await context.resume();

    return {
      stop: async () => {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const track of stream.getTracks()) track.stop();
        await context.close();
      },
    };
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    await context.close().catch(() => undefined);
    throw error;
  }
}
