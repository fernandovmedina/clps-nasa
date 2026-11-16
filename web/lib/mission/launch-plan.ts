import { fmtLanding } from '../engine/hud';
import { getLang, locale, t } from '../i18n';
import { missionDataDict } from '../i18n/dicts/mission-data';
import type { LandingRange } from './landing-param';
import { readLandingParams } from './landing-param';
import { evaluateSites, type SiteMetrics } from './scoring';
import type { MissionData, SiteInput } from './sites';

/** Direct transit Earth to the south pole: an assumption of the planner, not an ephemeris result. */
export const TRANSIT_DAYS = 4.5;

/** The landing loadMissionData falls back to when the URL names none. */
export const DEFAULT_LANDING = new Date(Date.UTC(2027, 0, 10, 0, 0));

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const ANY_RANGE: LandingRange = { start: new Date(0), end: new Date(8.64e15) };

export function landingFromLaunch(launch: Date): Date {
  return new Date(launch.getTime() + TRANSIT_DAYS * DAY_MS);
}

export function launchFromLanding(landing: Date): Date {
  return new Date(landing.getTime() - TRANSIT_DAYS * DAY_MS);
}

/** "10 ene 2027 · 00:00 UTC" in Spanish, "Jan 10, 2027 · 00:00 UTC" in English. */
export function formatPlanDate(date: Date): string {
  if (getLang() === 'es') return fmtLanding(date);
  const day = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  return `${day} · ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

const daysText = () => TRANSIT_DAYS.toLocaleString(locale());

/** "Tránsito directo de 4.5 días (supuesto)" / "Direct transit of 4.5 days (assumed)". */
export function transitHint(): string {
  return t(missionDataDict, 'plan.transitHint', { days: daysText() });
}

/** "4.5 días (supuesto)" / "4.5 days (assumed)". */
export function transitValue(): string {
  return t(missionDataDict, 'plan.transitValue', { days: daysText() });
}

/** The same rule as the landing parameter and the delay button: inside the ephemeris range, ends included. */
export function isLandingInRange(landing: Date, range: LandingRange): boolean {
  const ms = landing.getTime();
  return ms >= range.start.getTime() && ms <= range.end.getTime();
}

/** Launch dates whose arrival lands inside `range`. */
export function launchRange(range: LandingRange): LandingRange {
  return { start: launchFromLanding(range.start), end: launchFromLanding(range.end) };
}

export type LaunchCheck =
  | { ok: true; landing: Date }
  | { ok: false; reason: 'invalid' | 'out-of-range'; message: string };

export function checkLaunch(launch: Date | null, range: LandingRange): LaunchCheck {
  if (!launch || !Number.isFinite(launch.getTime())) {
    return { ok: false, reason: 'invalid', message: t(missionDataDict, 'plan.invalid') };
  }
  const landing = landingFromLaunch(launch);
  if (isLandingInRange(landing, range)) return { ok: true, landing };
  const launches = launchRange(range);
  return {
    ok: false,
    reason: 'out-of-range',
    message: t(missionDataDict, 'plan.outOfRange', {
      arrival: formatPlanDate(landing),
      start: formatPlanDate(range.start),
      end: formatPlanDate(range.end),
      launchStart: formatPlanDate(launches.start),
      launchEnd: formatPlanDate(launches.end),
    }),
  };
}

export const SOUTH_POLE_MAX_LAT = -60;

/** The first `count` south-polar sites, in the same order the orbit ranking gives them. */
export function topSites(sites: SiteInput[], landing: Date, count = 3): SiteMetrics[] {
  return evaluateSites(sites.filter((s) => s.lat <= SOUTH_POLE_MAX_LAT), landing).slice(0, count);
}

/** Values for <input type="date"> and <input type="time"> (UTC). */
export function launchInputs(launch: Date): { date: string; time: string } {
  return {
    date: `${launch.getUTCFullYear()}-${pad(launch.getUTCMonth() + 1)}-${pad(launch.getUTCDate())}`,
    time: `${pad(launch.getUTCHours())}:${pad(launch.getUTCMinutes())}`,
  };
}

/** The inverse of launchInputs; null while either field is empty or not a real date. */
export function parseLaunchInputs(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, day, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [number, number, number, number, number];
  if (h > 23 || mi > 59) return null;
  const out = new Date(Date.UTC(y, mo - 1, day, h, mi));
  return out.getUTCFullYear() === y && out.getUTCMonth() === mo - 1 && out.getUTCDate() === day ? out : null;
}

/** The value of the `landing` query parameter: ISO 8601 in UTC, seconds included, no fraction. */
export function landingParam(landing: Date): string {
  return landing.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** `href` with its `landing` parameter replaced; every other parameter and the hash stay as they are. */
export function withLandingParam(href: string, landing: Date): string {
  const url = new URL(href);
  url.searchParams.set('landing', landingParam(landing));
  return url.toString();
}

/** The landing the mission is using: the loaded data, else the URL, else the default. */
export function currentLanding(data: Pick<MissionData, 'landingDate'> | null, search: string): Date {
  return data?.landingDate ?? readLandingParams(new URLSearchParams(search), ANY_RANGE)?.landing ?? DEFAULT_LANDING;
}

/** The crew sees the planner first; the dev phase shortcut, the VR preview and a monitor skip it. */
export function opensPlanner(search: string, isHost: boolean): boolean {
  const params = new URLSearchParams(search);
  return isHost && !params.has('phase') && params.get('vr') !== 'preview';
}
