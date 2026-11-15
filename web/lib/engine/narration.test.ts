import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Narrator } from './narration';

class FakeUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  lang = '';
  voice: unknown = null;
  rate = 1;
  constructor(readonly text: string) {}
}

describe('Narrator suspension', () => {
  const spoken: string[] = [];
  const cancel = vi.fn();

  beforeEach(() => {
    spoken.length = 0;
    cancel.mockClear();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
      cancel,
      speak: (u: FakeUtterance) => { spoken.push(u.text); u.onend?.(); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('cancels what it was saying when suspended and ignores new lines until released', async () => {
    const narrator = new Narrator();
    narrator.setSuspended(true);
    expect(cancel).toHaveBeenCalled();
    narrator.speak('Aproximándonos a la Luna');
    await Promise.resolve();
    expect(spoken).toEqual([]);

    narrator.setSuspended(false);
    narrator.speak('Preparando inserción orbital');
    await vi.waitFor(() => expect(spoken).toEqual(['Preparando inserción orbital']));
    narrator.dispose();
  });
});

describe('Narrator recorded clips', () => {
  const spoken: string[] = [];
  const played: string[] = [];
  const audios: FakeAudio[] = [];
  const lastAudio = () => audios.at(-1) ?? null;

  class FakeAudio {
    preload = '';
    currentTime = 0;
    paused = true;
    onended: (() => void) | null = null;
    constructor(readonly src: string) { audios.push(this); }
    play() { this.paused = false; played.push(this.src); return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  function stubManifest(clips: Record<string, { file: string; text: string; durationMs: number }>) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ voiceId: 'carlos', modelId: 'm', clips }) })));
  }

  beforeEach(() => {
    spoken.length = 0;
    played.length = 0;
    audios.length = 0;
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
      cancel() {},
      speak: (u: FakeUtterance) => { spoken.push(u.text); u.onend?.(); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays the recorded CAPCOM clip for a scripted line', async () => {
    stubManifest({ liftoff: { file: 'liftoff.wav', text: 'Despegue confirmado.', durationMs: 1200 } });
    const narrator = new Narrator();
    await vi.waitFor(() => expect(lastAudio()).not.toBeNull());
    narrator.say('liftoff');
    expect(played).toEqual(['/audio/narration/liftoff.wav']);
    expect(spoken).toEqual([]);
    narrator.dispose();
  });

  it('falls back to TTS when the clip was recorded for a different text', async () => {
    stubManifest({ liftoff: { file: 'liftoff.wav', text: 'Texto viejo.', durationMs: 1200 } });
    const narrator = new Narrator();
    await new Promise((r) => setTimeout(r, 0));
    narrator.say('liftoff');
    expect(played).toEqual([]);
    await vi.waitFor(() => expect(spoken).toEqual(['Despegue confirmado.']));
    narrator.dispose();
  });

  it('stops the clip when CAPCOM starts talking', async () => {
    stubManifest({ liftoff: { file: 'liftoff.wav', text: 'Despegue confirmado.', durationMs: 1200 } });
    const narrator = new Narrator();
    await vi.waitFor(() => expect(lastAudio()).not.toBeNull());
    narrator.say('liftoff');
    expect(lastAudio()?.paused).toBe(false);
    narrator.setSuspended(true);
    expect(lastAudio()?.paused).toBe(true);
    narrator.dispose();
  });
});
