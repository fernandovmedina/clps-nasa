import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Narrator } from './narration';

class FakeUtterance {
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e?: { error?: string }) => void) | null = null;
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

describe('Narrator.sayAndWait', () => {
  const spoken: string[] = [];
  const played: string[] = [];
  const audios: ClipAudio[] = [];
  let playResult: () => Promise<void> = () => Promise.resolve();
  let speakBehaviour: (u: FakeUtterance) => void = (u) => { u.onend?.(); };
  const cancel = vi.fn();
  const lastAudio = () => audios.at(-1)!;

  class ClipAudio {
    preload = '';
    currentTime = 0;
    paused = true;
    onended: (() => void) | null = null;
    constructor(readonly src: string) { audios.push(this); }
    play() { this.paused = false; played.push(this.src); return playResult(); }
    pause() { this.paused = true; }
  }

  const WELCOME_CLIP = { welcome: { file: 'welcome.wav', text: 'Bienvenido a TOUCHDOWN. Soy el burrito espacial, tu guía. Vamos a elegir dónde y cuándo alunizar en el polo sur de la Luna.', durationMs: 6758 } };

  function stubManifest(clips: Record<string, { file: string; text: string; durationMs: number }> = WELCOME_CLIP) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ voiceId: 'carlos', modelId: 'm', clips }) })));
  }

  async function readyNarrator() {
    const narrator = new Narrator();
    await narrator.ready;
    return narrator;
  }

  const setActivation = (value: { hasBeenActive: boolean } | undefined) => {
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value });
  };

  beforeEach(() => {
    spoken.length = 0;
    played.length = 0;
    audios.length = 0;
    cancel.mockClear();
    playResult = () => Promise.resolve();
    speakBehaviour = (u) => { u.onend?.(); };
    vi.stubGlobal('Audio', ClipAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
      cancel,
      speak: (u: FakeUtterance) => { spoken.push(u.text); speakBehaviour(u); },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setActivation(undefined);
  });

  describe('ready', () => {
    it('settles once the recorded clips are known', async () => {
      stubManifest();
      const narrator = new Narrator();
      await narrator.ready;
      expect(audios).toHaveLength(1);
      expect(audios[0]!.src).toBe('/audio/narration/welcome.wav');
      narrator.dispose();
    });

    it('settles without clips when the manifest fails to load, and never rejects', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      const offline = new Narrator();
      await expect(offline.ready).resolves.toBeUndefined();
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
      const missing = new Narrator();
      await expect(missing.ready).resolves.toBeUndefined();
      expect(audios).toHaveLength(0);
      offline.dispose();
      missing.dispose();
    });
  });

  describe('with a recorded clip', () => {
    it('reports onStart when the clip starts sounding and "ended" when it finishes', async () => {
      stubManifest();
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      const outcome = vi.fn();
      void narrator.sayAndWait('welcome', onStart).then(outcome);
      await vi.waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
      expect(played).toEqual(['/audio/narration/welcome.wav']);
      expect(outcome).not.toHaveBeenCalled();
      lastAudio().onended?.();
      await vi.waitFor(() => expect(outcome).toHaveBeenCalledWith('ended'));
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(spoken).toEqual([]);
      narrator.dispose();
    });

    it('is "blocked" when the browser refuses to play, without falling back to TTS', async () => {
      stubManifest();
      playResult = () => Promise.reject(new DOMException('gesture required', 'NotAllowedError'));
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      await expect(narrator.sayAndWait('welcome', onStart)).resolves.toBe('blocked');
      expect(spoken).toEqual([]);
      expect(onStart).not.toHaveBeenCalled();
      narrator.dispose();
    });

    it('can be retried after being blocked', async () => {
      stubManifest();
      playResult = () => Promise.reject(new DOMException('gesture required', 'NotAllowedError'));
      const narrator = await readyNarrator();
      await expect(narrator.sayAndWait('welcome')).resolves.toBe('blocked');
      playResult = () => Promise.resolve();
      const again = narrator.sayAndWait('welcome');
      await vi.waitFor(() => expect(played).toHaveLength(2));
      lastAudio().onended?.();
      await expect(again).resolves.toBe('ended');
      narrator.dispose();
    });

    it('falls back to TTS when the clip cannot be decoded', async () => {
      stubManifest();
      playResult = () => Promise.reject(new DOMException('bad data', 'EncodingError'));
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      await expect(narrator.sayAndWait('welcome', onStart)).resolves.toBe('ended');
      expect(spoken.join(' ')).toContain('Bienvenido a TOUCHDOWN.');
      expect(onStart).toHaveBeenCalledTimes(1);
      narrator.dispose();
    });

    it('is "stopped" by stop(), pausing the clip, and never settles twice', async () => {
      stubManifest();
      const narrator = await readyNarrator();
      const outcome = vi.fn();
      void narrator.sayAndWait('welcome').then(outcome);
      await vi.waitFor(() => expect(played).toHaveLength(1));
      narrator.stop();
      expect(lastAudio().paused).toBe(true);
      await vi.waitFor(() => expect(outcome).toHaveBeenCalledWith('stopped'));
      lastAudio().onended?.();
      await Promise.resolve();
      expect(outcome).toHaveBeenCalledTimes(1);
      narrator.dispose();
    });

    it('is "stopped" when muted, suspended, replaced by another line or disposed', async () => {
      stubManifest();
      const narrator = await readyNarrator();

      let pending = narrator.sayAndWait('welcome');
      narrator.setMuted(true);
      await expect(pending).resolves.toBe('stopped');
      narrator.setMuted(false);

      pending = narrator.sayAndWait('welcome');
      narrator.setSuspended(true);
      await expect(pending).resolves.toBe('stopped');
      narrator.setSuspended(false);

      const first = narrator.sayAndWait('welcome');
      const second = narrator.sayAndWait('welcome');
      await expect(first).resolves.toBe('stopped');
      lastAudio().onended?.();
      await expect(second).resolves.toBe('ended');

      pending = narrator.sayAndWait('welcome');
      narrator.dispose();
      await expect(pending).resolves.toBe('stopped');
    });

    it('does not report onStart for a line stopped before it started sounding', async () => {
      stubManifest();
      let startPlaying!: () => void;
      playResult = () => new Promise<void>((resolve) => { startPlaying = resolve; });
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      const pending = narrator.sayAndWait('welcome', onStart);
      narrator.stop();
      startPlaying();
      await expect(pending).resolves.toBe('stopped');
      await Promise.resolve();
      expect(onStart).not.toHaveBeenCalled();
      narrator.dispose();
    });

    it('swallows the AbortError a pause() raises on a pending play()', async () => {
      stubManifest();
      let rejectPlay!: (e: unknown) => void;
      playResult = () => new Promise<void>((_, reject) => { rejectPlay = reject; });
      const narrator = await readyNarrator();
      const pending = narrator.sayAndWait('welcome');
      narrator.stop();
      rejectPlay(new DOMException('interrupted', 'AbortError'));
      await expect(pending).resolves.toBe('stopped');
      expect(spoken).toEqual([]);
      narrator.dispose();
    });
  });

  describe('with browser TTS', () => {
    it('speaks the line, reports onStart once and ends when the whole chain is done', async () => {
      stubManifest({});
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      await expect(narrator.sayAndWait('liftoff', onStart)).resolves.toBe('ended');
      expect(spoken).toEqual(['Despegue confirmado.']);
      expect(onStart).toHaveBeenCalledTimes(1);
      narrator.dispose();
    });

    it('fires onStart from the utterance start event, before it finishes', async () => {
      stubManifest({});
      let finish!: () => void;
      speakBehaviour = (u) => { u.onstart?.(); finish = () => u.onend?.(); };
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      const outcome = vi.fn();
      void narrator.sayAndWait('liftoff', onStart).then(outcome);
      await vi.waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
      expect(outcome).not.toHaveBeenCalled();
      finish();
      await vi.waitFor(() => expect(outcome).toHaveBeenCalledWith('ended'));
      expect(onStart).toHaveBeenCalledTimes(1);
      narrator.dispose();
    });

    it('is "blocked", without calling speak, when the page has never had a user gesture', async () => {
      stubManifest({});
      setActivation({ hasBeenActive: false });
      const narrator = await readyNarrator();
      await expect(narrator.sayAndWait('liftoff')).resolves.toBe('blocked');
      expect(spoken).toEqual([]);
      setActivation({ hasBeenActive: true });
      await expect(narrator.sayAndWait('liftoff')).resolves.toBe('ended');
      expect(spoken).toEqual(['Despegue confirmado.']);
      narrator.dispose();
    });

    it('is "blocked" when the first utterance fails with not-allowed', async () => {
      stubManifest({});
      speakBehaviour = (u) => { u.onerror?.({ error: 'not-allowed' }); };
      const narrator = await readyNarrator();
      const onStart = vi.fn();
      await expect(narrator.sayAndWait('liftoff', onStart)).resolves.toBe('blocked');
      expect(onStart).not.toHaveBeenCalled();
      narrator.dispose();
    });

    it('is "stopped" by stop() in the middle of a multi-clause line', async () => {
      stubManifest({});
      speakBehaviour = () => {};
      const narrator = await readyNarrator();
      const pending = narrator.sayAndWait('leftAtmosphere');
      await vi.waitFor(() => expect(spoken).toHaveLength(1));
      narrator.stop();
      expect(cancel).toHaveBeenCalled();
      await expect(pending).resolves.toBe('stopped');
      narrator.dispose();
    });
  });

  describe('silent', () => {
    it('is "silent" while muted or suspended, without playing anything', async () => {
      stubManifest();
      const narrator = await readyNarrator();
      narrator.setMuted(true);
      const onStart = vi.fn();
      await expect(narrator.sayAndWait('welcome', onStart)).resolves.toBe('silent');
      narrator.setMuted(false);
      narrator.setSuspended(true);
      await expect(narrator.sayAndWait('welcome', onStart)).resolves.toBe('silent');
      expect(played).toEqual([]);
      expect(spoken).toEqual([]);
      expect(onStart).not.toHaveBeenCalled();
      narrator.dispose();
    });

    it('is "silent" when there is neither a clip nor speech synthesis', async () => {
      vi.stubGlobal('speechSynthesis', undefined);
      stubManifest({});
      const narrator = await readyNarrator();
      await expect(narrator.sayAndWait('welcome')).resolves.toBe('silent');
      narrator.dispose();
    });
  });
});
