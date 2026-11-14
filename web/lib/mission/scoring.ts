/**
 * Simplified Sun/Earth geometry for lunar polar sites + site ranking.
 *
 * This is an educational approximation (mean lunation, libration and seasonal
 * sub-solar latitude as sinusoids, horizon from a per-site profile). Swap
 * `sunDirAt` / `earthDirAt` for JPL Horizons vectors and `horizonAt` for a LOLA
 * horizon mask to get mission-grade numbers — the rest of the app stays the same.
 */
import * as THREE from 'three';
import { DEG, clamp01, enuBasis, latLonToVec3, seeded, smooth, toLocal } from '../engine/util';
import { MOON_RADIUS_KM } from './config';
import type { SiteInput } from './sites';

const SYNODIC = 29.530589;
const ANOMALISTIC = 27.55455;
const DRACONIC = 27.212221;
const ECLIPSE_YEAR = 346.62;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // reference new moon

const days = (d: Date) => (d.getTime() - NEW_MOON_REF) / 86400000;
const wrap = (x: number) => ((x % 360) + 540) % 360 - 180;

/** Unit vector from the Moon toward the Sun (moon-fixed frame). */
export function sunDirAt(date: Date, out = new THREE.Vector3()) {
  const d = days(date);
  const lon = wrap(180 - 360 * (d / SYNODIC));
  const lat = 1.54 * Math.sin((2 * Math.PI * d) / ECLIPSE_YEAR);
  return latLonToVec3(lat, lon, 1, out);
}

/** Unit vector from the Moon toward the Earth (moon-fixed frame, with optical libration). */
export function earthDirAt(date: Date, out = new THREE.Vector3()) {
  const d = days(date);
  const lon = 7.9 * Math.sin((2 * Math.PI * d) / ANOMALISTIC);
  const lat = 6.7 * Math.sin((2 * Math.PI * d) / DRACONIC + 1.1);
  return latLonToVec3(lat, lon, 1, out);
}

/** Local terrain horizon elevation (deg) toward azimuth `azDeg` (0 = north, 90 = east). */
export function horizonAt(site: SiteInput, azDeg: number) {
  const r = seeded(site.id);
  const a1 = r() * 6.28, a2 = r() * 6.28, a3 = r() * 6.28;
  const az = azDeg * DEG;
  const profile = site.horizonDeg + 0.9 * Math.sin(az + a1) + 0.55 * Math.sin(2 * az + a2) + 0.3 * Math.sin(5 * az + a3);
  const dip = Math.acos(MOON_RADIUS_KM / (MOON_RADIUS_KM + site.elevationKm)) / DEG;
  return profile - dip;
}

export interface SkyPos { elevation: number; azimuth: number; local: THREE.Vector3; aboveHorizon: number }

export function skyPos(site: SiteInput, dir: THREE.Vector3): SkyPos {
  const basis = enuBasis(site.lat, site.lon);
  const local = toLocal(dir, basis);
  const elevation = Math.asin(THREE.MathUtils.clamp(local.y, -1, 1)) / DEG;
  const azimuth = ((Math.atan2(local.x, -local.z) / DEG) + 360) % 360;
  return { elevation, azimuth, local, aboveHorizon: elevation - horizonAt(site, azimuth) };
}

export interface SiteMetrics {
  site: SiteInput;
  score: number;          // 0..100
  rank: number;
  sun: SkyPos;            // at landing time
  earth: SkyPos;
  illumPct: number;       // % of the mission window with the Sun above the local horizon
  earthPct: number;       // % of the window with direct-to-Earth line of sight
  hoursToSunset: number;  // from landing (0 if landing in shadow)
  hoursToEarthset: number;
  longestDarkH: number;
  maxSunElev: number;
  tempC: number;
  powerPct: number;       // solar array output vs nominal, vertical array
  breakdown: { illum: number; earth: number; slope: number; power: number; dark: number };
}

const SUN_HALF_DISK = 0.27;

/** Evaluates every site over a mission window (default 14 days, hourly samples). */
export function evaluateSites(sites: SiteInput[], landing: Date, windowDays = 14): SiteMetrics[] {
  const N = Math.round(windowDays * 24);
  const sun = new THREE.Vector3(), earth = new THREE.Vector3();
  const results = sites.map((site) => {
    let lit = 0, vis = 0, maxSun = -90, run = 0, longest = 0;
    let toSunset = -1, toEarthset = -1;
    for (let h = 0; h <= N; h++) {
      const t = new Date(landing.getTime() + h * 3600000);
      const s = skyPos(site, sunDirAt(t, sun));
      const e = skyPos(site, earthDirAt(t, earth));
      const isLit = s.aboveHorizon > -SUN_HALF_DISK;
      const isVis = e.aboveHorizon > 0;
      if (isLit) { lit++; run = 0; } else { run++; longest = Math.max(longest, run); }
      if (isVis) vis++;
      if (!isLit && toSunset < 0) toSunset = h;
      if (!isVis && toEarthset < 0) toEarthset = h;
      maxSun = Math.max(maxSun, s.elevation);
    }
    const s0 = skyPos(site, sunDirAt(landing, sun));
    const e0 = skyPos(site, earthDirAt(landing, earth));
    const illum = lit / (N + 1), earthPct = vis / (N + 1);
    const sunUp = s0.aboveHorizon > -SUN_HALF_DISK;
    const powerPct = sunUp ? Math.round(100 * Math.cos(Math.max(0, s0.elevation) * DEG) * smooth(-SUN_HALF_DISK, 0.6, s0.aboveHorizon)) : 0;
    const tempK = sunUp ? 390 * Math.pow(Math.sin(Math.max(0.3, s0.elevation) * DEG), 0.25) : 95;
    const breakdown = {
      illum,
      earth: earthPct,
      slope: clamp01(1 - (site.slopeDeg - 2) / 12),
      power: powerPct / 100,
      dark: 1 - clamp01(longest / 240),
    };
    const score = 100 * (0.36 * breakdown.illum + 0.28 * breakdown.earth + 0.14 * breakdown.slope + 0.12 * breakdown.power + 0.1 * breakdown.dark);
    return {
      site, score, rank: 0, sun: s0, earth: e0,
      illumPct: illum * 100, earthPct: earthPct * 100,
      hoursToSunset: toSunset < 0 ? N : toSunset,
      hoursToEarthset: toEarthset < 0 ? N : toEarthset,
      longestDarkH: longest, maxSunElev: maxSun,
      tempC: tempK - 273.15, powerPct, breakdown,
    } satisfies SiteMetrics;
  });
  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

export const fmtHours = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${Math.round(h)} h`);
export const scoreColor = (score: number) => {
  // green (best) → amber → red (worst)
  const t = clamp01((score - 35) / 50);
  const c = new THREE.Color().setHSL(0.0 + 0.33 * t, 0.85, 0.55);
  return `#${c.getHexString()}`;
};
