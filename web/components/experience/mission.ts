import { PHASE_LABELS, PHASE_ORDER, fmtLanding, type RunMode } from '@/lib/engine/hud';
import type { PhaseName } from '@/lib/engine/app';
import { readLandingParams } from '@/lib/mission/landing-param';
import type { SiteMetrics } from '@/lib/mission/scoring';
import type { MissionData } from '@/lib/mission/sites';

export interface MissionInfo { site: string; landing: string }

const ANY_RANGE = { start: new Date(0), end: new Date(8.64e15) };

/**
 * Site and landing date shown in the "Misión" block. Before the data has loaded
 * only the URL knows them (the launch phase clears the session on purpose).
 */
export function describeMission(src: { data: MissionData | null; selected: SiteMetrics | null }, search: string): MissionInfo {
  const params = new URLSearchParams(search);
  const requested = readLandingParams(params, ANY_RANGE);
  const data = src.data;
  const byRequest = data?.requestedSiteId ? data.sites.find((s) => s.id === data.requestedSiteId)?.name : undefined;
  const site = src.selected?.site.name ?? byRequest ?? (requested?.site && !data ? 'Cargando sitio…' : 'Por elegir en la órbita');
  const date = data?.landingDate ?? requested?.landing;
  return { site, landing: date ? `Aterrizaje ${fmtLanding(date)}` : 'Cargando fecha de aterrizaje…' };
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
