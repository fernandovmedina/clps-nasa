/**
 * Site ranking and sky geometry, backed by real NASA-derived data via
 * `@touchdown/core` (JPL Horizons ephemeris + LOLA horizon masks).
 *
 * Score/status/windows come straight from `computeScenario` (the same
 * formula documented in CLAUDE.md sec. 7 and used by the Cloudflare Worker's
 * `/api/scenario`):
 *   score = 100 * (0.30*energy + 0.25*comms + 0.30*ops + 0.15*continuity)
 * `breakdown` holds exactly those four components (0..1), so the bars in the
 * VR detail panel are the real terms of the score. Ranking order is the same as
 * `compareScenarios`: status tier, then score, then ops, then energy.
 */
import * as THREE from 'three';
import { computeScenario, horizonAt as coreHorizonAt, positionAt, visibleDiskFraction, SUN_RADIUS_DEG } from '@touchdown/core';
import { clamp01 } from '../engine/util';
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
  powerPct: number;       // % of the solar disk above the local horizon at landing (sun-tracking array)
  /** The four score components (0..1) from computeScenario. */
  breakdown: { energy: number; comms: number; ops: number; continuity: number };
}

const SUN_HALF_DISK = 0.27;

function hoursUntil(iso: string | null, landingMs: number, fallbackH: number): number {
  if (!iso) return fallbackH;
  return Math.max(0, (Date.parse(iso) - landingMs) / 3_600_000);
}

const STATUS_TIER = { viable: 0, marginal: 1, not_viable: 2 } as const;

/** Evaluates every site over a mission window (default 14 days) using real ephemeris + horizon data. */
export function evaluateSites(sites: SiteInput[], landing: Date, windowDays = 14): SiteMetrics[] {
  const landingMs = landing.getTime();

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
    const longestDarkH = scenario.metrics.longest_dark_h;

    const sunUp = s0.aboveHorizon > -SUN_HALF_DISK;
    const powerPct = Math.round(100 * visibleDiskFraction(s0.aboveHorizon, SUN_RADIUS_DEG));
    const tempK = sunUp ? 390 * Math.pow(Math.sin(Math.max(0.3, s0.elevation) * (Math.PI / 180)), 0.25) : 95;

    const { energy, comms, ops, continuity } = scenario.metrics;
    const breakdown = { energy, comms, ops, continuity };

    // Hardcoded demo case "NO CAER" (sites.ts): always last, always not viable.
    const score = site.crash ? 0 : scenario.score;
    const status = site.crash ? 'not_viable' as const : scenario.status;

    return {
      site, score, rank: 0, status,
      sun: s0, earth: e0,
      illumPct: scenario.fractions.sun * 100,
      earthPct: scenario.fractions.earth * 100,
      hoursToSunset, hoursToEarthset, longestDarkH,
      maxSunElev: scenario.sun.max_elev,
      tempC: tempK - 273.15, powerPct, breakdown,
    } satisfies SiteMetrics;
  });

  results.sort((a, b) =>
    STATUS_TIER[a.status] - STATUS_TIER[b.status] ||
    b.score - a.score ||
    b.breakdown.ops - a.breakdown.ops ||
    b.breakdown.energy - a.breakdown.energy);
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
