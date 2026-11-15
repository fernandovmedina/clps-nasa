import {
  PARAM_MAP, RECIPE,
  type Envelope, type Layer, type NoiseKind, type Sound, type SoundId, type Sweepable, type Waveform,
} from './sounds';

export interface LoopControl {
  set(name: string, value: number): void;
  stop(): void;
}

export interface AudioEngineOptions {
  context?: BaseAudioContext;
}

type NoiseBank = Record<NoiseKind, AudioBuffer>;

interface Voice {
  layer: Layer;
  src: AudioScheduledSourceNode;
  osc: OscillatorNode | null;
  lfo: OscillatorNode | null;
  env: GainNode;
  level: GainNode;
}

const STORAGE_KEY = 'touchdown:sound-muted';
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
const NOISE_SECONDS = 3;
const NOISE_CROSSFADE_S = 0.25;
const NOISE_TAPER = 64;
const NOISE_TARGET_RMS = 0.4;
const SMOOTH_S = 0.1;
const TAIL_S = 0.05;
const NOOP_LOOP: LoopControl = { set() {}, stop() {} };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const isNoise = (s: Layer['source']): s is NoiseKind => s === 'white' || s === 'pink' || s === 'brown';

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function readMuted() {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('mute') === '1') return true;
  } catch { /* no URL access */ }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(ctx: BaseAudioContext, kind: NoiseKind, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * NOISE_SECONDS);
  const fade = Math.round(sr * NOISE_CROSSFADE_S);
  const raw = new Float32Array(len + fade);
  const rand = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rand() * 2 - 1;
    if (kind === 'white') {
      raw[i] = w;
    } else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      raw[i] = brown;
    }
  }

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  d.set(raw.subarray(0, len));
  for (let i = 0; i < fade; i++) {
    const p = (i / fade) * (Math.PI / 2);
    d[i] = raw[i] * Math.sin(p) + raw[len + i] * Math.cos(p);
  }
  for (let i = 0; i < NOISE_TAPER; i++) {
    const k = i / NOISE_TAPER;
    d[i] *= k;
    d[len - 1 - i] *= k;
  }

  let sum = 0, peak = 0;
  for (let i = 0; i < len; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
  const rms = Math.sqrt(sum / len) || 1;
  const scale = Math.min(NOISE_TARGET_RMS / rms, 0.98 / (peak || 1));
  for (let i = 0; i < len; i++) d[i] *= scale;
  return buf;
}

function sweep(p: AudioParam, v: Sweepable, when: number, dur: number | null) {
  if (typeof v === 'number') p.setValueAtTime(v, when);
  else if (dur === null) p.setValueAtTime(v[0], when);
  else { p.setValueAtTime(v[0], when); p.exponentialRampToValueAtTime(v[1], when + dur); }
}

function glide(p: AudioParam, target: number, now: number, immediate: boolean) {
  if (immediate) p.setValueAtTime(target, now);
  else p.setTargetAtTime(target, now, SMOOTH_S);
}

function attack(p: AudioParam, e: Envelope, when: number) {
  p.setValueAtTime(0, when);
  p.linearRampToValueAtTime(1, when + e.attack_s);
  p.linearRampToValueAtTime(e.sustain, when + e.attack_s + e.decay_s);
}

function adsr(p: AudioParam, e: Envelope, when: number, dur: number) {
  attack(p, e, when);
  const susAt = when + e.attack_s + e.decay_s;
  const relAt = Math.max(susAt, when + dur - e.release_s);
  p.setValueAtTime(e.sustain, relAt);
  p.linearRampToValueAtTime(0, relAt + e.release_s);
  return relAt + e.release_s;
}

function buildVoice(ctx: BaseAudioContext, dest: AudioNode, layer: Layer, noise: NoiseBank, when: number, dur: number | null, index: number): Voice {
  let src: AudioScheduledSourceNode;
  let osc: OscillatorNode | null = null;
  if (isNoise(layer.source)) {
    const b = ctx.createBufferSource();
    b.buffer = noise[layer.source];
    b.loop = true;
    b.start(when, (index * 0.37) % NOISE_SECONDS);
    src = b;
  } else {
    osc = ctx.createOscillator();
    osc.type = layer.source as Waveform;
    if (layer.freq_hz !== null) sweep(osc.frequency, layer.freq_hz, when, dur);
    osc.start(when);
    src = osc;
  }

  let tail: AudioNode = src;
  if (layer.filter) {
    const f = ctx.createBiquadFilter();
    f.type = layer.filter.type;
    f.Q.value = layer.filter.q;
    sweep(f.frequency, layer.filter.freq_hz, when, dur);
    tail.connect(f);
    tail = f;
  }

  const env = ctx.createGain();
  env.gain.value = 0;
  tail.connect(env);
  tail = env;

  let lfo: OscillatorNode | null = null;
  if (layer.lfo) {
    const mod = ctx.createGain();
    mod.gain.value = 1;
    const depth = ctx.createGain();
    depth.gain.value = layer.lfo.depth;
    lfo = ctx.createOscillator();
    lfo.frequency.value = layer.lfo.rate_hz;
    lfo.connect(depth);
    depth.connect(mod.gain);
    lfo.start(when);
    tail.connect(mod);
    tail = mod;
  }

  const level = ctx.createGain();
  level.gain.value = layer.gain;
  tail.connect(level);
  level.connect(dest);
  return { layer, src, osc, lfo, env, level };
}

class LoopVoice implements LoopControl {
  private ctx: BaseAudioContext | null = null;
  private voices: Voice[] = [];
  private values = new Map<string, number>();
  private stopped = false;

  constructor(private sound: Sound, init: Record<string, number>, private onDone: (v: LoopVoice) => void) {
    for (const p of sound.params) this.values.set(p.name, clamp01(init[p.name] ?? p.range[0]));
  }

  start(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank) {
    if (this.stopped || this.ctx) return;
    this.ctx = ctx;
    const t = ctx.currentTime;
    this.sound.layers.forEach((layer, i) => {
      const v = buildVoice(ctx, dest, layer, noise, t, null, i);
      attack(v.env.gain, layer.env, t);
      this.voices.push(v);
    });
    this.apply(true);
  }

  set(name: string, value: number) {
    if (this.stopped || !this.values.has(name)) return;
    this.values.set(name, clamp01(value));
    if (this.ctx) this.apply(false);
  }

  private apply(immediate: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const bindings = Object.entries(PARAM_MAP[this.sound.id] ?? {});
      this.voices.forEach((v, i) => {
        let level = v.layer.gain;
        let freq: number | null = null;
        for (const [name, b] of bindings) {
          const x = this.values.get(name) ?? 0;
          if (b.gain?.includes(i)) level *= x;
          if (b.freq && b.freq.layer === i) freq = b.freq.from + (b.freq.to - b.freq.from) * x;
        }
        glide(v.level.gain, level, now, immediate);
        if (freq !== null && v.osc) glide(v.osc.frequency, freq, now, immediate);
      });
    } catch { /* node already released */ }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.ctx;
    if (ctx) {
      try {
        const now = ctx.currentTime;
        for (const v of this.voices) {
          const end = now + v.layer.env.release_s;
          v.env.gain.cancelScheduledValues(now);
          v.env.gain.setValueAtTime(v.env.gain.value, now);
          v.env.gain.linearRampToValueAtTime(0, end);
          v.src.stop(end + TAIL_S);
          v.lfo?.stop(end + TAIL_S);
          v.src.onended = () => v.level.disconnect();
        }
      } catch { /* context already closed */ }
    }
    this.voices = [];
    this.onDone(this);
  }
}

export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private live: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: NoiseBank | null = null;
  private readonly sounds = new Map<SoundId, Sound>(RECIPE.sounds.map((s) => [s.id, s]));
  private readonly loops = new Set<LoopVoice>();
  private readonly injected: boolean;
  private failed = false;
  private disposed = false;
  private hiddenSuspend = false;
  private paused = false;
  private bound = false;
  private _muted = false;

  constructor(opts: AudioEngineOptions = {}) {
    this.injected = !!opts.context;
    if (opts.context) {
      this.setup(opts.context);
      return;
    }
    this._muted = readMuted();
    if (!audioCtor()) {
      this.failed = true;
      return;
    }
    for (const e of GESTURES) window.addEventListener(e, this.onGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.bound = true;
  }

  get muted() { return this._muted; }

  setMuted(value: boolean) {
    this._muted = value;
    try { window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
    this.applyMute();
  }

  /** Silences everything by suspending the context; the mute preference is left untouched. */
  pause() {
    this.paused = true;
    this.live?.suspend().catch(() => {});
  }

  resume() {
    this.paused = false;
    if (!this.hiddenSuspend) this.live?.resume().catch(() => {});
  }

  noiseBuffer(kind: NoiseKind) { return this.noise?.[kind] ?? null; }

  play(id: SoundId, delay = 0) {
    try {
      const s = this.sounds.get(id);
      const ctx = this.ctx, master = this.master, noise = this.noise;
      if (!s || s.kind !== 'oneshot' || this._muted || this.paused || !ctx || !master || !noise) return;
      if (!this.injected && ctx.state !== 'running') return;
      const when = ctx.currentTime + delay;
      const dur = s.duration_s ?? 0;
      s.layers.forEach((layer, i) => {
        const v = buildVoice(ctx, master, layer, noise, when, dur, i);
        const end = Math.max(adsr(v.env.gain, layer.env, when, dur), when + dur) + TAIL_S;
        v.src.stop(end);
        v.lfo?.stop(end);
      });
    } catch { /* audio is best effort */ }
  }

  loop(id: SoundId, initial: Record<string, number> = {}): LoopControl {
    try {
      const s = this.sounds.get(id);
      if (!s || s.kind !== 'loop' || this.failed || this.disposed) return NOOP_LOOP;
      const voice = new LoopVoice(s, initial, (v) => this.loops.delete(v));
      this.loops.add(voice);
      if (this.ctx && this.master && this.noise) voice.start(this.ctx, this.master, this.noise);
      return voice;
    } catch {
      return NOOP_LOOP;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unbind();
    for (const l of [...this.loops]) l.stop();
    this.loops.clear();
    const live = this.live, master = this.master;
    this.live = null; this.ctx = null; this.master = null; this.noise = null;
    if (!live) return;
    try { master?.gain.setTargetAtTime(0, live.currentTime, 0.015); } catch { /* already closed */ }
    setTimeout(() => { live.close().catch(() => {}); }, 120);
  }

  private setup(ctx: BaseAudioContext) {
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : RECIPE.master.gain;
    const c = RECIPE.master.compressor;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = c.threshold;
    comp.ratio.value = c.ratio;
    comp.attack.value = c.attack;
    comp.release.value = c.release;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.noise = { white: makeNoise(ctx, 'white', 1), pink: makeNoise(ctx, 'pink', 2), brown: makeNoise(ctx, 'brown', 3) };
    this.master = master;
    this.ctx = ctx;
    for (const l of this.loops) l.start(ctx, master, this.noise);
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctor = audioCtor();
    if (!Ctor || this.failed || this.disposed) return null;
    try {
      this.live = new Ctor({ latencyHint: 'interactive' });
      this.setup(this.live);
      if (this.paused) this.live.suspend().catch(() => {});
    } catch {
      this.failed = true;
      this.live?.close().catch(() => {});
      this.live = null; this.ctx = null; this.master = null;
    }
    return this.ctx;
  }

  private applyMute() {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    try { master.gain.setTargetAtTime(this._muted ? 0 : RECIPE.master.gain, ctx.currentTime, 0.03); } catch { /* closed */ }
  }

  private unbind() {
    if (!this.bound) return;
    this.bound = false;
    for (const e of GESTURES) window.removeEventListener(e, this.onGesture, { capture: true });
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onGesture = () => {
    this.ensure();
    if (this.live && !this.paused && this.live.state !== 'running') this.live.resume().catch(() => {});
  };

  private onVisibility = () => {
    const live = this.live;
    if (!live) return;
    if (document.hidden) {
      if (live.state === 'running') { this.hiddenSuspend = true; live.suspend().catch(() => {}); }
    } else if (this.hiddenSuspend) {
      this.hiddenSuspend = false;
      if (!this.paused) live.resume().catch(() => {});
    }
  };
}
