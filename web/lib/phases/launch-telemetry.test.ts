import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GlobalFile } from '@touchdown/core';
import { MEAN_MOON_DISTANCE_KM, earthMoonDistanceKm } from './launch-telemetry';

const series = { start: '2027-01-01T00:00:00Z', step_minutes: 60, count: 3, earth_range_km: [400_000, 404_000, 402_000] };
const at = (iso: string) => earthMoonDistanceKm(series, new Date(iso));

describe('earthMoonDistanceKm', () => {
  it('returns the sample on an exact step and interpolates between steps', () => {
    expect(at('2027-01-01T01:00:00Z')).toBe(404_000);
    expect(at('2027-01-01T00:30:00Z')).toBe(402_000);
    expect(at('2027-01-01T01:15:00Z')).toBe(403_500);
  });

  it('clamps to the ends of the series', () => {
    expect(at('2026-12-01T00:00:00Z')).toBe(400_000);
    expect(at('2027-02-01T00:00:00Z')).toBe(402_000);
  });

  it('is null for an unusable series', () => {
    expect(earthMoonDistanceKm({ ...series, earth_range_km: [] }, new Date())).toBeNull();
    expect(earthMoonDistanceKm({ ...series, start: 'nope' }, new Date())).toBeNull();
    expect(earthMoonDistanceKm({ ...series, step_minutes: 0 }, new Date())).toBeNull();
  });

  it('matches the real series for the default landing date', () => {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data/global.json');
    const global = JSON.parse(readFileSync(file, 'utf8')) as GlobalFile;
    const km = earthMoonDistanceKm(global, new Date(Date.UTC(2027, 0, 10)))!;
    expect(km).toBeGreaterThan(404_300);
    expect(km).toBeLessThan(404_450);
    expect(Math.abs(km - MEAN_MOON_DISTANCE_KM)).toBeGreaterThan(19_000);
  });
});
