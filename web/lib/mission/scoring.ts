/**
 * Site ranking and sky geometry, backed by real NASA-derived data via
 * `@touchdown/core` (JPL Horizons ephemeris + LOLA horizon masks).
 *
 * Score/status/windows come straight from `computeScenario` (the same
 * formula documented in CLAUDE.md sec. 7 and used by the Cloudflare Worker's
 * `/api/scenario`): score = 100 * (0.5 * sun_fraction + 0.5 * earth_fraction).
 * `breakdown` below is presentation-only (feeds the detail-panel bars in
 * orbit.ts) and does not affect the score.
 */
import * as THREE from 'three';
import { computeScenario, horizonAt as coreHorizonAt, positionAt } from '@touchdown/core';
import { clamp01, smooth } from '../engine/util';
import type { SiteInput } from './sites';

export interface SkyPos { elevation: number; azimuth: number; local: THREE.Vector3; aboveHorizon: number }

/** az/el (deg, az from north clockwise to east) -> local scene vector (x=east, y=up, z=-north). */
function localFromAzEl(azDeg: number, elDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = azDeg * (Math.PI / 180), el = elDeg * (Math.PI / 180);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

function azElToSkyPos(site: SiteInput, azDeg: number, elDeg: number): SkyPos {
  return {
    elevation: elDeg,
    azimuth: azDeg,
    local: localFromAzEl(azDeg, elDeg),
    aboveHorizon: elDeg - coreHorizonAt(site.horizon, azDeg),
  };
}

/** Horizon elevation (deg) toward azimuth `azDeg`, from the real LOLA mask (or spherical fallback). */
export function horizonAt(site: SiteInput, azDeg: number): number {
  return coreHorizonAt(site.horizon, azDeg);
}

/** Sun/Earth sky position at an arbitrary time (interpolated from the real ephemeris track). */
export function skyPosAt(site: SiteInput, date: Date): { sun: SkyPos; earth: SkyPos } {
  const pos = positionAt(site.track, date.getTime());
  if (!pos) throw new RangeError(`date outside ephemeris range for site ${site.id}: ${date.toISOString()}`);
  return {
    sun: azElToSkyPos(site, pos.sun.az, pos.sun.el),
    earth: azElToSkyPos(site, pos.earth.az, pos.earth.el),
  };
}

export interface SiteMetrics {
  site: SiteInput;
  score: number;          // 0..100, from computeScenario (sec. 7 formula)
  rank: number;
  status: 'viable' | 'marginal' | 'not_viable';
  sun: SkyPos;            // at landing time
  earth: SkyPos;
  illumPct: number;       // % of the mission window with the Sun above the local horizon
  earthPct: number;       // % of the window with direct-to-Earth line of sight
  hoursToSunset: number;  // from landing (0 if landing in shadow)
  hoursToEarthset: number;
  longestDarkH: number;
  maxSunElev: number;
  tempC: number;
  powerPct: number;       // solar array output vs nominal, vertical array (presentation model)
  breakdown: { illum: number; earth: number; slope: number; power: number; dark: number };
}

const SUN_HALF_DISK = 0.27;

function hoursUntil(iso: string | null, landingMs: number, fallbackH: number): number {
  if (!iso) return fallbackH;
  return Math.max(0, (Date.parse(iso) - landingMs) / 3_600_000);
}

/** Longest gap (hours) between consecutive "visible" windows within [landingMs, endMs]. */
function longestGapHours(windows: [string, string][], landingMs: number, endMs: number): number {
  const spans = windows.map(([a, b]) => [Date.parse(a), Date.parse(b)] as const).sort((a, b) => a[0] - b[0]);
  let cursor = landingMs, longest = 0;
  for (const [s, e] of spans) {
    if (s > cursor) longest = Math.max(longest, s - cursor);
    cursor = Math.max(cursor, e);
  }
  if (endMs > cursor) longest = Math.max(longest, endMs - cursor);
  return longest / 3_600_000;
}

/** Evaluates every site over a mission window (default 14 days) using real ephemeris + horizon data. */
export function evaluateSites(sites: SiteInput[], landing: Date, windowDays = 14): SiteMetrics[] {
  const landingMs = landing.getTime();
  const missionEndMs = landingMs + windowDays * 86_400_000;

  const results = sites.map((site) => {
    const scenario = computeScenario({
      site: { id: site.id, name: site.name, horizon_source: site.horizonSource, ephemeris_source: site.ephemerisSource },
      track: site.track,
      horizon: site.horizon,
      landing: landing.toISOString(),
      durationDays: windowDays,
    });

    const now = positionAt(site.track, landingMs);
    if (!now) throw new RangeError(`landing date outside ephemeris range for site ${site.id}`);
    const s0 = azElToSkyPos(site, now.sun.az, now.sun.el);
    const e0 = azElToSkyPos(site, now.earth.az, now.earth.el);

    const hoursToSunset = hoursUntil(scenario.sun.next_set, landingMs, windowDays * 24);
    const hoursToEarthset = hoursUntil(scenario.earth.next_set, landingMs, windowDays * 24);
    const longestDarkH = longestGapHours(scenario.windows.sun, landingMs, missionEndMs);

    const sunUp = s0.aboveHorizon > -SUN_HALF_DISK;
    const powerPct = sunUp
      ? Math.round(100 * Math.cos(Math.max(0, s0.elevation) * (Math.PI / 180)) * smooth(-SUN_HALF_DISK, 0.6, s0.aboveHorizon))
      : 0;
    const tempK = sunUp ? 390 * Math.pow(Math.sin(Math.max(0.3, s0.elevation) * (Math.PI / 180)), 0.25) : 95;

    const breakdown = {
      illum: scenario.fractions.sun,
      earth: scenario.fractions.earth,
      slope: clamp01(1 - (site.slopeDeg - 2) / 12),
      power: powerPct / 100,
      dark: 1 - clamp01(longestDarkH / 240),
    };

    return {
      site, score: scenario.score, rank: 0, status: scenario.status,
      sun: s0, earth: e0,
      illumPct: scenario.fractions.sun * 100,
      earthPct: scenario.fractions.earth * 100,
      hoursToSunset, hoursToEarthset, longestDarkH,
      maxSunElev: scenario.sun.max_elev,
      tempC: tempK - 273.15, powerPct, breakdown,
    } satisfies SiteMetrics;
  });

  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

export const fmtHours = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${Math.round(h)} h`);
export const scoreColor = (score: number) => {
  // green (best) -> amber -> red (worst)
  const t = clamp01((score - 35) / 50);
  const c = new THREE.Color().setHSL(0.0 + 0.33 * t, 0.85, 0.55);
  return `#${c.getHexString()}`;
};
