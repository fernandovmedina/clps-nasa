import type { PhaseName } from './app';

export type HudTone = 'ok' | 'warn' | 'bad';
export type SiteStatus = 'viable' | 'marginal' | 'not_viable';

export interface HudReadout {
  label: string;
  value: string;
  size?: 'lg' | 'md';
  meter?: { value: number; label: string };
}

export interface HudFact { label: string; value: string }

export interface HudRankRow {
  id: string;
  rank: number;
  name: string;
  score: number;
  status: SiteStatus;
  selected: boolean;
  delta?: number;
  run?: () => void;
}

export interface HudSky {
  kind: 'sun' | 'earth';
  label: string;
  value: string;
  detail: string;
  share: number;
  shareLabel: string;
}

export interface HudAction {
  id: string;
  label: string;
  disabled?: boolean;
  run?: () => void;
  href?: string;
}

export interface HudToggle {
  id: string;
  label: string;
  pressed: boolean;
  disabled?: boolean;
  run?: () => void;
}

export type HudSide =
  | { kind: 'readouts'; items: HudReadout[]; note?: string }
  | { kind: 'ranking'; title: string; rows: HudRankRow[] }
  | { kind: 'sky'; blocks: HudSky[]; extras?: HudFact[] };

/**
 * What a phase shows in the DOM control layer. Plain data plus the actions
 * the phase's own 3D panels already run: JSON.stringify skips the functions,
 * so the serialized form is exactly what gets painted.
 */
export interface PhaseHud {
  figure: { value: string; caption: string; badge?: { label: string; tone: HudTone } };
  detail?: string;
  progress?: { value: number; label: string; text?: string };
  facts?: HudFact[];
  toggles?: { label: string; options: HudToggle[] };
  side: HudSide;
  secondary?: HudAction[];
  primary?: HudAction;
  /** The phase has not begun yet (the launch waits for its start button): there is nothing to pause. */
  waiting?: boolean;
}

export type RunMode = 'running' | 'paused' | 'stopped';

/** Pause / stop / restart bookkeeping, kept apart from the renderer so it can be tested alone. */
export class RunState {
  private current: RunMode = 'running';

  get mode(): RunMode { return this.current; }
  get paused() { return this.current === 'paused'; }
  get stopped() { return this.current === 'stopped'; }
  get simulating() { return this.current === 'running'; }

  pause() {
    if (this.current !== 'running') return false;
    this.current = 'paused';
    return true;
  }

  resume() {
    if (this.current !== 'paused') return false;
    this.current = 'running';
    return true;
  }

  stop() {
    if (this.current === 'stopped') return false;
    this.current = 'stopped';
    return true;
  }

  restart() { this.current = 'running'; }

  /** Simulation time to advance this frame: nothing unless the mission is running. */
  step(dt: number) { return this.current === 'running' ? dt : 0; }
}

export const PHASE_LABELS: Record<PhaseName, string> = {
  launch: 'Despegue',
  orbit: 'Órbita y ranking',
  pov: 'Vista del sitio',
  landing: 'Alunizaje',
  transmit: 'Transmisión',
};

export const PHASE_ORDER: PhaseName[] = ['launch', 'orbit', 'pov', 'landing', 'transmit'];

export const STATUS_LABELS: Record<SiteStatus, string> = {
  viable: 'Viable',
  marginal: 'Marginal',
  not_viable: 'No viable',
};

export const STATUS_TONES: Record<SiteStatus, HudTone> = {
  viable: 'ok',
  marginal: 'warn',
  not_viable: 'bad',
};

const NBSP = String.fromCharCode(160);
const LIGHT_KM_PER_S = 299792.458;

/** One-way signal delay (s) over `km`. */
export const signalDelayS = (km: number) => km / LIGHT_KM_PER_S;

/** "384,400 km" → "384 400 km" (non-breaking space as the thousands separator). */
export function groupThousands(text: string): string {
  return text.replace(/(\d),(?=\d{3}(?!\d))/g, `$1${NBSP}`);
}

export function fmtInt(n: number): string {
  return groupThousands(Math.round(n).toLocaleString('en-US'));
}

/** Fixed decimals with a real minus sign, never "-0.00". */
export function fmtSigned(n: number, digits: number): string {
  const text = Math.abs(n).toFixed(digits);
  const isZero = Number(text) === 0;
  return n < 0 && !isZero ? `−${text}` : text;
}

export function fmtPercent(n: number): string {
  return `${Math.round(n)}${NBSP}%`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "10 ene 2027 · 00:00 UTC" */
export function fmtLanding(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return `${day} · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function fmtLatLon(lat: number, lon: number): string {
  return `${fmtSigned(lat, 2)}°, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** The launch countdown labels the phase draws on its 3D panel, as a headline figure. */
export function countdownFigure(label: string): { value: string; caption: string } | null {
  const tick = /^T-(\d)$/.exec(label);
  if (tick) return { value: `T − ${tick[1]}`, caption: 'segundos para la ignición' };
  if (label === 'IGNICIÓN') return { value: 'Ignición', caption: 'encendido de motores' };
  if (label === 'DESPEGUE') return { value: 'Despegue', caption: 'rumbo a la Luna' };
  return null;
}

/** Every callable thing a HUD offers, by id, so a click can be resolved against a fresh snapshot. */
export function collectActions(hud: PhaseHud): Map<string, () => void> {
  const out = new Map<string, () => void>();
  const add = (id: string, run?: () => void) => { if (run) out.set(id, run); };
  if (hud.primary) add(hud.primary.id, hud.primary.run);
  for (const a of hud.secondary ?? []) add(a.id, a.run);
  for (const o of hud.toggles?.options ?? []) add(o.id, o.run);
  if (hud.side.kind === 'ranking') for (const r of hud.side.rows) add(r.id, r.run);
  return out;
}
