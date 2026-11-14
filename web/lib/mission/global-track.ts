/**
 * Moon-fixed Sun/Earth direction at an arbitrary time, from the real
 * sub-solar/sub-earth point series in `web/public/data/global.json`
 * (JPL Horizons). Used by the orbit phase to light/position the whole Moon,
 * independent of any single landing site.
 */
import * as THREE from 'three';
import type { GlobalFile } from '@touchdown/core';
import { latLonToVec3 } from '../engine/util';

function sampleIndex(global: GlobalFile, date: Date): { i: number; f: number } {
  const startMs = Date.parse(global.start);
  const stepMs = global.step_minutes * 60_000;
  const pos = (date.getTime() - startMs) / stepMs;
  const last = global.count - 1;
  const i = Math.min(Math.max(Math.floor(pos), 0), last);
  const j = Math.min(i + 1, last);
  const f = i === last ? 0 : Math.min(1, Math.max(0, pos - i));
  return { i, f: j === i ? 0 : f };
}

function lerp(a: number, b: number, f: number) { return a + (b - a) * f; }

/** Longitude lerp that takes the short way around ±180° (sub-solar/sub-earth longitude wraps every synodic month). */
function lerpLonDeg(a: number, b: number, f: number): number {
  const delta = (((b - a + 180) % 360) + 360) % 360 - 180; // shortest signed delta in (-180, 180]
  return a + delta * f;
}

export function globalDirAt(global: GlobalFile, date: Date, body: 'sun' | 'earth', out = new THREE.Vector3()): THREE.Vector3 {
  const { i, f } = sampleIndex(global, date);
  const j = Math.min(i + 1, global.count - 1);
  const lat = body === 'sun'
    ? lerp(global.sub_solar_lat[i]!, global.sub_solar_lat[j]!, f)
    : lerp(global.sub_earth_lat[i]!, global.sub_earth_lat[j]!, f);
  const lon = body === 'sun'
    ? lerpLonDeg(global.sub_solar_lon[i]!, global.sub_solar_lon[j]!, f)
    : lerpLonDeg(global.sub_earth_lon[i]!, global.sub_earth_lon[j]!, f);
  return latLonToVec3(lat, lon, 1, out);
}
