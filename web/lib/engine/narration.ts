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

  constructor() {
    if (!this.synth) return;
    this.pickVoice();
    // Chrome/Edge often return an empty voice list on the very first call.
    this.synth.addEventListener('voiceschanged', this.pickVoice);
  }

  private pickVoice = () => {
    const voices = this.synth?.getVoices() ?? [];
    const byLang = (prefix: string) => voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
    this.voice = byLang('es-mx') ?? byLang('es-us') ?? byLang('es-419') ?? byLang('es-es') ?? byLang('es');
  };

  /** Stops anything currently queued/playing the instant the user mutes; a later unmute doesn't replay it. */
  setMuted(muted: boolean) {
    if (muted && !this.muted) this.synth?.cancel();
    this.muted = muted;
  }

  speak(text: string) {
    if (!this.synth || this.muted) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = this.voice?.lang ?? 'es-ES';
    if (this.voice) u.voice = this.voice;
    this.synth.speak(u);
  }

  dispose() {
    this.synth?.cancel();
    this.synth?.removeEventListener('voiceschanged', this.pickVoice);
  }
}
