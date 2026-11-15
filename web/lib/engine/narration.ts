const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Clause { text: string; pauseAfterMs: number }

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
 * Thin wrapper around the browser's native TTS (SpeechSynthesis) - no backend, no API key,
 * works offline. Scoped to just "speak this line": each phase keeps its own one-shot flags
 * (same idiom already used everywhere in this engine, e.g. launch.ts's `countLabel` checks)
 * to decide *when* to call `speak`, so restarting the mission narrates again from the top.
 * Reused later for the voice-agent Q&A planned for pov.ts - this is the TTS half of that.
 */
export class Narrator {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis : null;
  private voice: SpeechSynthesisVoice | null = null;
  private muted = false;
  private suspended = false;
  /** Bumped on every speak()/setMuted(true)/dispose() so an in-flight clause chain can tell
   *  it's been superseded and stop queuing further chunks instead of talking over the new line. */
  private gen = 0;

  constructor() {
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
    this.voice = byLang('es-mx') ?? byLang('es-us') ?? byLang('es-419') ?? byLang('es-es') ?? byLang('es') ?? byLang('spa') ?? byName();
    if (voices.length && !this.voice) {
      // No Spanish voice installed on this device's TTS engine at all - no front-end code can
      // fix the accent from here, only installing a Spanish voice/language pack can. Setting
      // `lang` on the utterance anyway (see speakOne()) is the best effort left, but most
      // engines pick the accent from the chosen *voice*, not the `lang` field, so this will
      // still come out English-accented until a Spanish voice exists on the device.
      console.warn('[narration] no se encontró una voz en español; el narrador sonará con la voz por defecto del dispositivo (probablemente con acento inglés). Revisa speechSynthesis.getVoices() en la consola, o instala un paquete de voz en español del sistema.');
    }
  };

  /** Stops anything currently queued/playing the instant the user mutes; a later unmute doesn't replay it. */
  setMuted(muted: boolean) {
    if (muted && !this.muted) { this.gen++; this.synth?.cancel(); }
    this.muted = muted;
  }

  /** CAPCOM is talking: cancels what the narrator was saying and ignores new lines until it is released. */
  setSuspended(suspended: boolean) {
    if (suspended && !this.suspended) { this.gen++; this.synth?.cancel(); }
    this.suspended = suspended;
  }

  /** Queues `text` as its own clause chain, cancelling whatever the narrator was still saying. */
  speak(text: string) {
    if (!this.synth || this.muted || this.suspended) return;
    this.gen++;
    const myGen = this.gen;
    this.synth.cancel();
    void this.speakClauses(splitIntoClauses(text), myGen);
  }

  private async speakClauses(clauses: Clause[], myGen: number) {
    for (const clause of clauses) {
      if (this.gen !== myGen) return; // superseded by a newer speak()/mute - stop talking over it
      await this.speakOne(clause.text);
      if (this.gen !== myGen) return;
      if (clause.pauseAfterMs) await wait(clause.pauseAfterMs);
    }
  }

  private speakOne(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.voice?.lang ?? 'es-ES';
      if (this.voice) u.voice = this.voice;
      // Slightly under 1x: a flat, instant "1.0" reads as rushed/robotic for short mission-
      // control lines - this is closer to how someone actually paces a status callout.
      u.rate = 0.94;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this.synth.speak(u);
    });
  }

  dispose() {
    this.gen++;
    this.synth?.cancel();
    this.synth?.removeEventListener('voiceschanged', this.pickVoice);
  }
}
