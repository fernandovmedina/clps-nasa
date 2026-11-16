import { getLang, subscribe as subscribeLang, type Lang } from '@/lib/i18n';
import {
  narrationAudioDir, narrationManifestUrl, narrationText,
  type NarrationId, type NarrationManifest,
} from './narration-lines';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Clause { text: string; pauseAfterMs: number }

/** How `sayAndWait` went: it played to the end, the browser refused to play without a gesture, nothing could sound, or it was cut off. */
export type SayOutcome = 'ended' | 'blocked' | 'silent' | 'stopped';

/**
 * Splits on sentence/clause punctuation so we can insert a deliberate pause between parts -
 * the Web Speech API has no SSML <break> support, this is the only lever available to make a
 * single long utterance (e.g. "Estoy comparando cada sitio por tres cosas: X, Y, y Z.") sound
 * like a person pacing their speech instead of one flat, monotone block.
 */
function splitIntoClauses(text: string): Clause[] {
  const parts = text.split(/(?<=[.!?:;,])\s+/).filter((p) => p.trim().length > 0);
  return parts.map((p, i) => {
    if (i === parts.length - 1) return { text: p, pauseAfterMs: 0 };
    const endsStrong = /[.!?]$/.test(p);
    const endsMedium = /[:;]$/.test(p);
    return { text: p, pauseAfterMs: endsStrong ? 320 : endsMedium ? 220 : 130 };
  });
}

/**
 * Mission narrator. Fixed script lines (`say(id)`) play a pre-recorded clip in CAPCOM's own
 * voice (Nova 2 Sonic `carlos` in Spanish, `matthew` in English, see narration-lines.ts), so the launch sounds like the same
 * person on every device. Text and audio follow `getLang()` at the moment a line is said; the English clips live in
 * /audio/narration/en/ with their own manifest. Anything without a clip - free text via `speak`, a clip that failed
 * to load, or a clip recorded for a different text - falls back to the browser's native TTS
 * (SpeechSynthesis) - no backend, no API key, works offline. Scoped to just "speak this line": each phase keeps its own one-shot flags
 * (same idiom already used everywhere in this engine, e.g. launch.ts's `countLabel` checks)
 * to decide *when* to call `speak`, so restarting the mission narrates again from the top.
 * Reused later for the voice-agent Q&A planned for pov.ts - this is the TTS half of that.
 */
export class Narrator {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis : null;
  private voices: Record<Lang, SpeechSynthesisVoice | null> = { es: null, en: null };
  private muted = false;
  private suspended = false;
  /** Bumped on every speak()/setMuted(true)/dispose() so an in-flight clause chain can tell
   *  it's been superseded and stop queuing further chunks instead of talking over the new line. */
  private gen = 0;
  /** Pre-recorded clips by language and id; only ids whose recorded text still matches the script of that language. */
  private clips: Record<Lang, Map<NarrationId, HTMLAudioElement>> = { es: new Map(), en: new Map() };
  /** One manifest load per language, started the first time that language is in use. */
  private loads = new Map<Lang, Promise<void>>();
  private unsubscribeLang: (() => void) | null = null;
  private playing: HTMLAudioElement | null = null;
  /** Settles the `sayAndWait` in flight; `stopAll()` resolves it as 'stopped' because pausing a clip fires no `ended`. */
  private settle: ((outcome: SayOutcome) => void) | null = null;
  /** Settles once the recorded clips of the language in use at construction are known (loaded, or loading failed). Never rejects. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadClips(getLang());
    // Switching language loads the other language's clips (once); lines already playing finish in the language they began.
    this.unsubscribeLang = subscribeLang(() => { void this.loadClips(getLang()); });
    if (!this.synth) return;
    this.pickVoice();
    // Chrome/Edge often return an empty voice list on the very first call.
    this.synth.addEventListener('voiceschanged', this.pickVoice);
  }

  private pickVoice = () => {
    const voices = this.synth?.getVoices() ?? [];
    const byLang = (prefix: string) => voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
    // Some Android/Quest/Windows TTS engines list a Spanish voice under a non-"es" lang tag
    // (e.g. the ISO 639-2 "spa", or no usable tag at all) - catch those by known voice names
    // too before giving up. Covers Windows SAPI (Sabina/Helena), macOS/iOS (Mónica/Paulina/
    // Juan/Jorge/Diego/Esperanza) and Chrome's remote "Google español".
    const byName = () => voices.find((v) => /spanish|español|espanol|\bspa\b|sabina|helena|m[oó]nica|paulina|\bjuan\b|jorge|diego|esperanza/i.test(v.name)) ?? null;
    this.voices.es = byLang('es-mx') ?? byLang('es-us') ?? byLang('es-419') ?? byLang('es-es') ?? byLang('es') ?? byLang('spa') ?? byName();
    // English: US first (the narration is written for en-US), then any English; the ISO 639-2 "eng" tag and a few known names as a last resort.
    this.voices.en = byLang('en-us') ?? byLang('en-gb') ?? byLang('en') ?? byLang('eng')
      ?? voices.find((v) => /english|\bzira\b|\bdavid\b|\bmark\b|samantha|alex|daniel/i.test(v.name)) ?? null;
    if (voices.length && !this.voices.es) {
      // No Spanish voice installed on this device's TTS engine at all - no front-end code can
      // fix the accent from here, only installing a Spanish voice/language pack can. Setting
      // `lang` on the utterance anyway (see speakOne()) is the best effort left, but most
      // engines pick the accent from the chosen *voice*, not the `lang` field, so this will
      // still come out English-accented until a Spanish voice exists on the device.
      console.warn('[narration] no se encontró una voz en español; el narrador sonará con la voz por defecto del dispositivo (probablemente con acento inglés). Revisa speechSynthesis.getVoices() en la consola, o instala un paquete de voz en español del sistema.');
    }
  };

  private loadClips(lang: Lang): Promise<void> {
    let load = this.loads.get(lang);
    if (!load) { load = this.fetchClips(lang).catch(() => {}); this.loads.set(lang, load); }
    return load;
  }

  private async fetchClips(lang: Lang) {
    if (typeof window === 'undefined' || typeof fetch !== 'function' || typeof Audio === 'undefined') return;
    try {
      const res = await fetch(narrationManifestUrl(lang));
      if (!res.ok) return;
      const manifest = (await res.json()) as NarrationManifest;
      const dir = narrationAudioDir(lang);
      for (const [id, clip] of Object.entries(manifest.clips) as [NarrationId, NonNullable<NarrationManifest['clips'][NarrationId]>][]) {
        // A clip recorded for an older wording would say the wrong thing - TTS of the current text is better.
        if (!clip || narrationText(id, lang) !== clip.text) continue;
        const audio = new Audio(`${dir}/${clip.file}`);
        audio.preload = 'auto';
        this.clips[lang].set(id, audio);
      }
    } catch { /* no clips: every line uses TTS */ }
  }

  /** Stops the clip and/or TTS currently playing. */
  private stopAll() {
    this.gen++;
    this.synth?.cancel();
    if (this.playing) { this.playing.pause(); this.playing = null; }
    const settle = this.settle;
    this.settle = null;
    settle?.('stopped');
  }

  /** Stops whatever is being said (clip or TTS). */
  stop() { this.stopAll(); }

  /** Stops anything currently queued/playing the instant the user mutes; a later unmute doesn't replay it. */
  setMuted(muted: boolean) {
    if (muted && !this.muted) this.stopAll();
    this.muted = muted;
  }

  /** CAPCOM is talking: cancels what the narrator was saying and ignores new lines until it is released. */
  setSuspended(suspended: boolean) {
    if (suspended && !this.suspended) this.stopAll();
    this.suspended = suspended;
  }

  /** Says a scripted line in CAPCOM's recorded voice, or with TTS if its clip isn't available. */
  say(id: NarrationId) {
    if (this.muted || this.suspended) return;
    const lang = getLang();
    const clip = this.clips[lang].get(id);
    if (!clip) { this.speak(narrationText(id, lang), lang); return; }
    this.stopAll();
    const myGen = this.gen;
    clip.currentTime = 0;
    this.playing = clip;
    clip.onended = () => { if (this.playing === clip) this.playing = null; };
    clip.play().catch(() => {
      // Blocked or failed to decode: say it with TTS rather than stay silent.
      if (this.gen !== myGen) return;
      this.playing = null;
      this.speak(narrationText(id, lang), lang);
    });
  }

  /**
   * Says a scripted line like `say()` and reports how it went. `onStart` fires once, when the line actually starts
   * sounding. Browsers refuse audio before a user gesture: that is 'blocked' (no TTS attempt - it would be refused too),
   * and the caller can retry from a click. Never rejects.
   */
  sayAndWait(id: NarrationId, onStart?: () => void): Promise<SayOutcome> {
    const lang = getLang();
    const clip = this.clips[lang].get(id);
    if (this.muted || this.suspended || (!clip && !this.synth)) return Promise.resolve('silent');
    this.stopAll();
    const myGen = this.gen;
    return new Promise<SayOutcome>((resolve) => {
      const finish = (outcome: SayOutcome) => {
        if (this.settle === finish) this.settle = null;
        resolve(outcome);
      };
      this.settle = finish;
      const started = () => { if (this.gen === myGen) onStart?.(); };
      const text = narrationText(id, lang);
      if (!clip) { void this.speakAndReport(text, lang, myGen, finish, started); return; }

      clip.currentTime = 0;
      this.playing = clip;
      clip.onended = () => {
        if (this.playing === clip) this.playing = null;
        if (this.gen === myGen) finish('ended');
      };
      clip.play().then(started, (err: unknown) => {
        if (this.gen !== myGen) return; // paused by stop(): that rejects a pending play() with AbortError
        this.playing = null;
        if ((err as { name?: string } | null)?.name === 'NotAllowedError') { finish('blocked'); return; }
        void this.speakAndReport(text, lang, myGen, finish, started);
      });
    });
  }

  private async speakAndReport(text: string, lang: Lang, myGen: number, finish: (outcome: SayOutcome) => void, started: () => void) {
    if (!this.synth) { finish('silent'); return; }
    // Chrome logs a console warning when speak() is called before any user gesture, and refuses it anyway.
    const activation = typeof navigator !== 'undefined' ? navigator.userActivation : undefined;
    if (activation && !activation.hasBeenActive) { finish('blocked'); return; }
    const result = await this.speakClauses(splitIntoClauses(text), lang, myGen, started);
    if (result === 'blocked') finish('blocked');
    else if (result === 'done') finish('ended');
  }

  /** Queues `text` as its own clause chain, cancelling whatever the narrator was still saying. `lang` picks the TTS voice (default: the current language). */
  speak(text: string, lang: Lang = getLang()) {
    if (!this.synth || this.muted || this.suspended) return;
    this.stopAll();
    const myGen = this.gen;
    void this.speakClauses(splitIntoClauses(text), lang, myGen);
  }

  private async speakClauses(clauses: Clause[], lang: Lang, myGen: number, onStart?: () => void): Promise<'done' | 'blocked' | 'superseded'> {
    for (const [i, clause] of clauses.entries()) {
      if (this.gen !== myGen) return 'superseded'; // superseded by a newer speak()/mute - stop talking over it
      const error = await this.speakOne(clause.text, lang, i === 0 ? onStart : undefined);
      if (this.gen !== myGen) return 'superseded';
      if (i === 0 && error === 'not-allowed') return 'blocked';
      if (clause.pauseAfterMs) await wait(clause.pauseAfterMs);
    }
    return 'done';
  }

  /** Resolves with the utterance's error code, or null when it was spoken. */
  private speakOne(text: string, lang: Lang, onStart?: () => void): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.synth) { resolve(null); return; }
      const u = new SpeechSynthesisUtterance(text);
      const voice = this.voices[lang];
      u.lang = voice?.lang ?? (lang === 'en' ? 'en-US' : 'es-ES');
      if (voice) u.voice = voice;
      // Slightly under 1x: a flat, instant "1.0" reads as rushed/robotic for short mission-
      // control lines - this is closer to how someone actually paces a status callout.
      u.rate = 0.94;
      let started = false;
      const markStarted = () => { if (!started) { started = true; onStart?.(); } };
      u.onstart = markStarted;
      u.onend = () => { markStarted(); resolve(null); }; // some engines never fire `start`
      u.onerror = (e) => resolve(e?.error ?? 'error');
      this.synth.speak(u);
    });
  }

  dispose() {
    this.stopAll();
    this.unsubscribeLang?.();
    this.unsubscribeLang = null;
    this.clips.es.clear();
    this.clips.en.clear();
    this.synth?.removeEventListener('voiceschanged', this.pickVoice);
  }
}
