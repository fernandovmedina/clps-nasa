import { PHASE_ORDER, type HudSide, type PhaseHud, type RunMode, type SiteStatus } from '@/lib/engine/hud';
import type { PhaseName } from '@/lib/engine/app';
import { fmtPlanDate, phaseLabel } from './ui-text';
import { readLandingParams } from '@/lib/mission/landing-param';
import { t } from '@/lib/i18n';
import { missionDict } from '@/lib/i18n/dicts/ui-mission';
import { currentLanding, launchFromLanding } from '@/lib/mission/launch-plan';
import { earthMoonDistanceKm } from '@/lib/phases/launch-telemetry';
import { fmtHours, type SiteMetrics } from '@/lib/mission/scoring';
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
  const site = src.selected?.site.name ?? byRequest ?? (requested?.site && !data ? t(missionDict, 'site.loading') : t(missionDict, 'site.pending'));
  const landing = currentLanding(data, search);
  return { site, launch: t(missionDict, 'plan.launch', { date: fmtPlanDate(launchFromLanding(landing)) }), landing: t(missionDict, 'plan.landing', { date: fmtPlanDate(landing) }) };
}

/** What the polite live region says when the run mode or the phase changes; empty when nothing changed. */
export function announce(prev: { phase: PhaseName; mode: RunMode }, next: { phase: PhaseName; mode: RunMode }): string {
  if (prev.mode !== next.mode) {
    if (next.mode === 'paused') return t(missionDict, 'announce.paused');
    if (next.mode === 'stopped') return t(missionDict, 'announce.stopped');
    return t(missionDict, prev.mode === 'stopped' ? 'announce.restarted' : 'announce.resumed');
  }
  if (prev.phase !== next.phase) return t(missionDict, 'announce.phase', { n: PHASE_ORDER.indexOf(next.phase) + 1, total: PHASE_ORDER.length, phase: phaseLabel(next.phase) });
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

export interface SiteSummary {
  name: string;
  score: number;
  status: SiteStatus;
  sunElevation: number;
  earthElevation: number;
  earthVisible: boolean;
  /** Hours (or days) until the Sun / the Earth set, from the landing. */
  sunHours: string;
  earthHours: string;
  /** NO CAER: a demo case, not a site; it has no score or status to show. */
  demo?: boolean;
  /** Contrast label for sites outside the south pole. */
  note?: string;
}

/** The contrast label of a site outside the south pole, in the current language (the demo case carries none: it shows the demo mark instead). */
function extras(m: SiteMetrics): { demo?: true; note?: string } {
  if (m.site.crash) return { demo: true as const };
  const region = m.site.region;
  return region === 'equatorial' || region === 'mid-latitude' || region === 'far-side' ? { note: t(missionDict, `contrast.${region}`) } : {};
}

export function summarizeSite(m: SiteMetrics | null): SiteSummary | null {
  if (!m) return null;
  return {
    name: m.site.name,
    score: Math.round(m.score),
    status: m.status,
    sunElevation: Math.round(m.sun.elevation * 100) / 100,
    earthElevation: Math.round(m.earth.elevation * 100) / 100,
    earthVisible: m.earth.aboveHorizon > 0,
    sunHours: fmtHours(m.hoursToSunset),
    earthHours: fmtHours(m.hoursToEarthset),
    ...extras(m),
  };
}

export interface RankSummary { id: string; rank: number; name: string; score: number; status: SiteStatus; demo?: boolean; note?: string }

export function summarizeRanking(ranking: SiteMetrics[], count = 5): RankSummary[] {
  return ranking.slice(0, count).map((m) => ({ id: m.site.id, rank: m.rank, name: m.site.name, score: Math.round(m.score), status: m.status, ...extras(m) }));
}

/** Earth-Moon distance (km) at the landing, rounded to the km so the snapshot only changes when the plan does. */
export function moonDistanceKm(data: MissionData | null): number | null {
  const km = data ? earthMoonDistanceKm(data.global, data.landingDate) : null;
  return km === null ? null : Math.round(km);
}
