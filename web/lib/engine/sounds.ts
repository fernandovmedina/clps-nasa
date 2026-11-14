export const SOUND_IDS = [
  'countdown_tick',
  'ignition',
  'engine_rumble',
  'liftoff_crackle',
  'wind_maxq',
  'orbit_ambient',
  'scan_blip',
  'ui_select',
  'ui_confirm',
  'landing_thruster',
  'touchdown_thud',
  'dust_hiss',
  'transmit_chirp',
  'success_chime',
  'error_tone',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];
export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type NoiseKind = 'white' | 'pink' | 'brown';
export type Sweepable = number | [number, number];

export interface Envelope { attack_s: number; decay_s: number; sustain: number; release_s: number }
export interface Lfo { target: 'gain'; rate_hz: number; depth: number }
export interface LayerFilter { type: 'lowpass' | 'highpass' | 'bandpass'; freq_hz: Sweepable; q: number }
export interface Layer {
  source: Waveform | NoiseKind;
  freq_hz: Sweepable | null;
  filter: LayerFilter | null;
  gain: number;
  env: Envelope;
  lfo: Lfo | null;
}
export interface ParamSpec { name: string; range: [number, number]; maps_to: string }
export interface Sound {
  id: SoundId;
  kind: 'oneshot' | 'loop';
  duration_s: number | null;
  layers: Layer[];
  params: ParamSpec[];
  note: string;
}
export interface Recipe {
  master: { gain: number; compressor: { threshold: number; ratio: number; attack: number; release: number } };
  sounds: Sound[];
}

export const RECIPE: Recipe = {
  master: { gain: 0.65, compressor: { threshold: -18, ratio: 3, attack: 0.01, release: 0.25 } },
  sounds: [
    {
      id: 'countdown_tick', kind: 'oneshot', duration_s: 0.12,
      layers: [
        { source: 'sine', freq_hz: 880, filter: null, gain: 0.12, env: { attack_s: 0.005, decay_s: 0.03, sustain: 0.4, release_s: 0.07 }, lfo: null },
      ],
      params: [],
      note: 'Short cabin timer tick.',
    },
    {
      id: 'ignition', kind: 'oneshot', duration_s: 2.4,
      layers: [
        { source: 'brown', freq_hz: null, filter: { type: 'lowpass', freq_hz: [180, 900], q: 0.7 }, gain: 0.32, env: { attack_s: 0.12, decay_s: 0.45, sustain: 0.7, release_s: 0.8 }, lfo: null },
        { source: 'pink', freq_hz: null, filter: { type: 'bandpass', freq_hz: [450, 1800], q: 0.8 }, gain: 0.12, env: { attack_s: 0.06, decay_s: 0.35, sustain: 0.3, release_s: 0.7 }, lfo: null },
        { source: 'sine', freq_hz: [45, 72], filter: null, gain: 0.15, env: { attack_s: 0.18, decay_s: 0.4, sustain: 0.7, release_s: 0.8 }, lfo: null },
      ],
      params: [],
      note: 'Sweep arrays over the full sound duration.',
    },
    {
      id: 'engine_rumble', kind: 'loop', duration_s: null,
      layers: [
        { source: 'brown', freq_hz: null, filter: { type: 'lowpass', freq_hz: 550, q: 0.7 }, gain: 0.25, env: { attack_s: 0.5, decay_s: 0.4, sustain: 0.85, release_s: 0.8 }, lfo: null },
        { source: 'pink', freq_hz: null, filter: { type: 'bandpass', freq_hz: 850, q: 0.7 }, gain: 0.08, env: { attack_s: 0.5, decay_s: 0.4, sustain: 0.85, release_s: 0.8 }, lfo: null },
        { source: 'sine', freq_hz: 55, filter: { type: 'lowpass', freq_hz: 180, q: 0.7 }, gain: 0.09, env: { attack_s: 0.5, decay_s: 0.4, sustain: 0.85, release_s: 0.8 }, lfo: null },
      ],
      params: [
        { name: 'thrust', range: [0, 1], maps_to: 'Linearly scale all layer gains from 0 to their listed values; sweep layer 3 frequency from 40 to 75 Hz.' },
        { name: 'atmosphere', range: [0, 1], maps_to: 'Linearly scale layers 1 and 2 from silence to their thrust-scaled gains; keep layer 3 as cabin vibration.' },
      ],
      note: 'Crossfade noise buffer boundaries; vacuum retains cabin vibration only.',
    },
    {
      id: 'liftoff_crackle', kind: 'loop', duration_s: null,
      layers: [
        { source: 'pink', freq_hz: null, filter: { type: 'bandpass', freq_hz: 1700, q: 0.8 }, gain: 0.07, env: { attack_s: 0.3, decay_s: 0.2, sustain: 0.8, release_s: 0.5 }, lfo: { target: 'gain', rate_hz: 8, depth: 0.35 } },
        { source: 'brown', freq_hz: null, filter: { type: 'bandpass', freq_hz: 600, q: 1.2 }, gain: 0.05, env: { attack_s: 0.3, decay_s: 0.2, sustain: 0.8, release_s: 0.5 }, lfo: { target: 'gain', rate_hz: 5, depth: 0.25 } },
      ],
      params: [],
      note: 'Crossfade noise boundaries; keep modulation phases continuous; ground only.',
    },
    {
      id: 'wind_maxq', kind: 'loop', duration_s: null,
      layers: [
        { source: 'pink', freq_hz: null, filter: { type: 'bandpass', freq_hz: 1100, q: 0.7 }, gain: 0.14, env: { attack_s: 0.8, decay_s: 0.3, sustain: 0.9, release_s: 1 }, lfo: { target: 'gain', rate_hz: 0.3, depth: 0.2 } },
        { source: 'brown', freq_hz: null, filter: { type: 'lowpass', freq_hz: 350, q: 0.7 }, gain: 0.1, env: { attack_s: 0.8, decay_s: 0.3, sustain: 0.9, release_s: 1 }, lfo: null },
      ],
      params: [
        { name: 'dynamic_pressure', range: [0, 1], maps_to: 'Linearly scale both layer gains from 0 to their listed values.' },
      ],
      note: 'Crossfade noise boundaries; keep modulation phase continuous.',
    },
    {
      id: 'orbit_ambient', kind: 'loop', duration_s: null,
      layers: [
        { source: 'sine', freq_hz: 110, filter: null, gain: 0.035, env: { attack_s: 2, decay_s: 1, sustain: 0.8, release_s: 2 }, lfo: { target: 'gain', rate_hz: 0.08, depth: 0.15 } },
        { source: 'brown', freq_hz: null, filter: { type: 'lowpass', freq_hz: 180, q: 0.7 }, gain: 0.025, env: { attack_s: 2, decay_s: 1, sustain: 0.8, release_s: 2 }, lfo: null },
      ],
      params: [],
      note: 'Cabin ambience; crossfade noise boundaries; maintain oscillator phases.',
    },
    {
      id: 'scan_blip', kind: 'oneshot', duration_s: 0.3,
      layers: [
        { source: 'sine', freq_hz: [1050, 1450], filter: null, gain: 0.09, env: { attack_s: 0.01, decay_s: 0.06, sustain: 0.5, release_s: 0.15 }, lfo: null },
      ],
      params: [],
      note: 'Sweep frequency over the full sound duration.',
    },
    {
      id: 'ui_select', kind: 'oneshot', duration_s: 0.1,
      layers: [
        { source: 'sine', freq_hz: 700, filter: null, gain: 0.07, env: { attack_s: 0.005, decay_s: 0.025, sustain: 0.4, release_s: 0.06 }, lfo: null },
      ],
      params: [],
      note: 'Soft interface selection.',
    },
    {
      id: 'ui_confirm', kind: 'oneshot', duration_s: 0.35,
      layers: [
        { source: 'sine', freq_hz: [660, 990], filter: null, gain: 0.1, env: { attack_s: 0.01, decay_s: 0.08, sustain: 0.55, release_s: 0.18 }, lfo: null },
      ],
      params: [],
      note: 'Sweep frequency over the full sound duration.',
    },
    {
      id: 'landing_thruster', kind: 'loop', duration_s: null,
      layers: [
        { source: 'brown', freq_hz: null, filter: { type: 'lowpass', freq_hz: 260, q: 0.7 }, gain: 0.16, env: { attack_s: 0.2, decay_s: 0.2, sustain: 0.85, release_s: 0.4 }, lfo: { target: 'gain', rate_hz: 3, depth: 0.15 } },
        { source: 'sine', freq_hz: 65, filter: null, gain: 0.07, env: { attack_s: 0.2, decay_s: 0.2, sustain: 0.85, release_s: 0.4 }, lfo: null },
      ],
      params: [
        { name: 'throttle', range: [0, 1], maps_to: 'Linearly scale both gains from 0 to listed values; sweep layer 2 frequency from 45 to 85 Hz.' },
      ],
      note: 'Cabin vibration; crossfade noise boundaries; maintain modulation phase.',
    },
    {
      id: 'touchdown_thud', kind: 'oneshot', duration_s: 1,
      layers: [
        { source: 'sine', freq_hz: [95, 45], filter: null, gain: 0.18, env: { attack_s: 0.01, decay_s: 0.2, sustain: 0.25, release_s: 0.45 }, lfo: null },
        { source: 'brown', freq_hz: null, filter: { type: 'lowpass', freq_hz: 350, q: 0.7 }, gain: 0.12, env: { attack_s: 0.01, decay_s: 0.15, sustain: 0.15, release_s: 0.35 }, lfo: null },
      ],
      params: [],
      note: 'Cabin impact; sweep frequency over the full duration.',
    },
    {
      id: 'dust_hiss', kind: 'oneshot', duration_s: 1.5,
      layers: [
        { source: 'pink', freq_hz: null, filter: { type: 'bandpass', freq_hz: [1200, 500], q: 0.8 }, gain: 0.055, env: { attack_s: 0.15, decay_s: 0.25, sustain: 0.5, release_s: 0.7 }, lfo: null },
      ],
      params: [],
      note: 'Stylized cabin dust contact; sweep over the full duration.',
    },
    {
      id: 'transmit_chirp', kind: 'oneshot', duration_s: 0.55,
      layers: [
        { source: 'sine', freq_hz: [900, 1700], filter: null, gain: 0.08, env: { attack_s: 0.01, decay_s: 0.1, sustain: 0.65, release_s: 0.12 }, lfo: { target: 'gain', rate_hz: 8, depth: 0.4 } },
      ],
      params: [],
      note: 'Cabin telemetry cue; sweep over the full duration.',
    },
    {
      id: 'success_chime', kind: 'oneshot', duration_s: 1.2,
      layers: [
        { source: 'sine', freq_hz: 660, filter: null, gain: 0.08, env: { attack_s: 0.02, decay_s: 0.25, sustain: 0.3, release_s: 0.7 }, lfo: null },
        { source: 'sine', freq_hz: 990, filter: null, gain: 0.055, env: { attack_s: 0.12, decay_s: 0.25, sustain: 0.3, release_s: 0.7 }, lfo: null },
      ],
      params: [],
      note: 'Gentle harmonic confirmation.',
    },
    {
      id: 'error_tone', kind: 'oneshot', duration_s: 0.55,
      layers: [
        { source: 'triangle', freq_hz: [440, 330], filter: { type: 'lowpass', freq_hz: 1800, q: 0.7 }, gain: 0.09, env: { attack_s: 0.015, decay_s: 0.1, sustain: 0.6, release_s: 0.2 }, lfo: null },
      ],
      params: [],
      note: 'Restrained warning; sweep over the full duration.',
    },
  ],
};

export interface ParamBinding {
  gain?: number[];
  freq?: { layer: number; from: number; to: number };
}

export const PARAM_MAP: Partial<Record<SoundId, Record<string, ParamBinding>>> = {
  engine_rumble: {
    thrust: { gain: [0, 1, 2], freq: { layer: 2, from: 40, to: 75 } },
    atmosphere: { gain: [0, 1] },
  },
  wind_maxq: {
    dynamic_pressure: { gain: [0, 1] },
  },
  landing_thruster: {
    throttle: { gain: [0, 1], freq: { layer: 1, from: 45, to: 85 } },
  },
};
