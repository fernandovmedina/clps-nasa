import { describe, expect, it } from 'vitest';
import { CAPTURE_WORKLET } from './audio-capture';
import { PLAYER_WORKLET } from './audio-playback';

type Processor = {
  port: { postMessage: (message: unknown, transfer?: unknown[]) => void; onmessage: ((event: { data: unknown }) => void) | null };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
};

function load(source: string, sampleRate: number, options?: unknown) {
  const posted: unknown[] = [];
  class AudioWorkletProcessor {
    port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: unknown) => {
        posted.push(message);
      },
    };
  }
  let Registered: (new (options?: unknown) => Processor) | null = null;
  const registerProcessor = (_name: string, ctor: new (options?: unknown) => Processor) => {
    Registered = ctor;
  };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(AudioWorkletProcessor, registerProcessor, sampleRate);
  if (!Registered) throw new Error('worklet did not register a processor');
  const Ctor: new (options?: unknown) => Processor = Registered;
  return { processor: new Ctor(options), posted };
}

describe('capture worklet', () => {
  it.each([16000, 44100, 48000])('delivers 16 kHz frames of 512 samples from a %i Hz context', (rate) => {
    const { processor, posted } = load(CAPTURE_WORKLET, rate);
    const seconds = 1;
    const input = new Float32Array(128);
    let n = 0;
    for (let block = 0; block < (rate * seconds) / 128; block++) {
      for (let i = 0; i < 128; i++, n++) input[i] = 0.5 * Math.sin((2 * Math.PI * 440 * n) / rate);
      processor.process([[input]], []);
    }
    const frames = (posted as ArrayBuffer[]).map((buffer) => new Int16Array(buffer));
    expect(frames.length).toBeGreaterThanOrEqual(30);
    expect(frames.every((frame) => frame.length === 512)).toBe(true);
    const peak = Math.max(...frames.flatMap((frame) => Array.from(frame).map(Math.abs)));
    expect(peak).toBeGreaterThan(0.45 * 32768);
    expect(peak).toBeLessThanOrEqual(0.5 * 32768 + 200);
  });
});

describe('player worklet', () => {
  const settings = { processorOptions: { prebufferMs: 100, maxWaitMs: 130 } };
  const chunk = (value: number, length: number) => new Float32Array(length).fill(value);
  const pull = (processor: Processor) => {
    const out = new Float32Array(128);
    processor.process([], [[out]]);
    return out;
  };

  it('stays silent until the prebuffer is filled, then plays without gaps', () => {
    const { processor } = load(PLAYER_WORKLET, 24000, settings);
    processor.port.onmessage?.({ data: { type: 'audio', samples: chunk(0.25, 1200) } });
    expect(Math.max(...pull(processor))).toBe(0);
    processor.port.onmessage?.({ data: { type: 'audio', samples: chunk(0.25, 1200) } });
    for (let i = 0; i < 10; i++) expect(Array.from(pull(processor)).every((v) => v === 0.25)).toBe(true);
  });

  it('plays a short tail that never reaches the prebuffer after the wait', () => {
    const { processor } = load(PLAYER_WORKLET, 24000, settings);
    processor.port.onmessage?.({ data: { type: 'audio', samples: chunk(0.5, 256) } });
    let played = 0;
    for (let i = 0; i < 40; i++) played += pull(processor).filter((v) => v === 0.5).length;
    expect(played).toBe(256);
  });

  it('drops queued audio on clear and reports the drain', () => {
    const { processor, posted } = load(PLAYER_WORKLET, 24000, settings);
    processor.port.onmessage?.({ data: { type: 'audio', samples: chunk(0.5, 4800) } });
    pull(processor);
    processor.port.onmessage?.({ data: { type: 'clear' } });
    expect(Math.max(...pull(processor))).toBe(0);

    processor.port.onmessage?.({ data: { type: 'audio', samples: chunk(0.5, 2400) } });
    for (let i = 0; i < 30; i++) pull(processor);
    expect(posted).toContainEqual({ type: 'drained' });
  });
});
