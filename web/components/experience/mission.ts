import { PHASE_LABELS, PHASE_ORDER, type HudSide, type PhaseHud, type RunMode } from '@/lib/engine/hud';
import type { PhaseName } from '@/lib/engine/app';
import { readLandingParams } from '@/lib/mission/landing-param';
import { currentLanding, formatPlanDate, launchFromLanding } from '@/lib/mission/launch-plan';
import type { SiteMetrics } from '@/lib/mission/scoring';
import type { MissionData } from '@/lib/mission/sites';

export interface MissionInfo { site: string; launch: string; landing: string }

const ANY_RANGE = { start: new Date(0), end: new Date(8.64e15) };

/**
 * Site, launch and arrival shown in the "Misión" block. Before the data has loaded
 * only the URL knows them (the launch phase clears the session on purpose); with
 * neither, the mission falls back to the default landing the data loader uses.
 */
export function describeMission(src: { data: MissionData | null; selected: SiteMetrics | null }, search: string): MissionInfo {
  const params = new URLSearchParams(search);
  const requested = readLandingParams(params, ANY_RANGE);
  const data = src.data;
  const byRequest = data?.requestedSiteId ? data.sites.find((s) => s.id === data.requestedSiteId)?.name : undefined;
  const site = src.selected?.site.name ?? byRequest ?? (requested?.site && !data ? 'Cargando sitio…' : 'Por elegir en la órbita');
  const landing = currentLanding(data, search);
  return { site, launch: `Despegue ${formatPlanDate(launchFromLanding(landing))}`, landing: `Llegada ${formatPlanDate(landing)}` };
}

/** What the polite live region says when the run mode or the phase changes; empty when nothing changed. */
export function announce(prev: { phase: PhaseName; mode: RunMode }, next: { phase: PhaseName; mode: RunMode }): string {
  if (prev.mode !== next.mode) {
    if (next.mode === 'paused') return 'Simulación pausada.';
    if (next.mode === 'stopped') return 'La misión se detuvo.';
    return prev.mode === 'stopped' ? 'Misión reiniciada desde el despegue.' : 'Simulación reanudada.';
  }
  if (prev.phase !== next.phase) return `Fase ${PHASE_ORDER.indexOf(next.phase) + 1} de ${PHASE_ORDER.length}: ${PHASE_LABELS[next.phase]}.`;
  return '';
}

const percent = (value: number) => Math.round(value * 100) / 100;

/**
 * The part of a phase's HUD that is actually painted in each run mode, with bar
 * values cut to the whole percent the bars can show, so changes nobody can see
 * (a float creeping toward 1, a progress line hidden while paused) never repaint.
 */
export function paintedHud(mode: RunMode, hud: PhaseHud | null): PhaseHud | null {
  if (!hud || mode === 'stopped') return null;
  const side: HudSide = hud.side.kind === 'readouts'
    ? { ...hud.side, items: hud.side.items.map((i) => (i.meter ? { ...i, meter: { ...i.meter, value: percent(i.meter.value) } } : i)) }
    : hud.side.kind === 'sky'
      ? { ...hud.side, blocks: hud.side.blocks.map((b) => ({ ...b, share: percent(b.share) })) }
      : hud.side;
  const base = { ...hud, side, progress: hud.progress && { ...hud.progress, value: percent(hud.progress.value) } };
  return mode === 'paused' ? { ...base, progress: undefined, detail: undefined } : base;
}
