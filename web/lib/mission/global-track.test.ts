import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GlobalFile } from '@touchdown/core';
import { earthRangeKmAt } from './global-track';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data');
const global = JSON.parse(readFileSync(resolve(dataDir, 'global.json'), 'utf8')) as GlobalFile;

describe('earthRangeKmAt', () => {
  it('returns the JPL Horizons sample on an exact hour', () => {
    const start = new Date(global.start);
    expect(earthRangeKmAt(global, start)).toBeCloseTo(global.earth_range_km[0]!, 6);
    const index = 1680;
    const date = new Date(Date.parse(global.start) + index * global.step_minutes * 60_000);
    expect(earthRangeKmAt(global, date)).toBeCloseTo(global.earth_range_km[index]!, 6);
  });

  it('interpolates between hourly samples', () => {
    const date = new Date(Date.parse(global.start) + 30 * 60_000);
    const mid = (global.earth_range_km[0]! + global.earth_range_km[1]!) / 2;
    expect(earthRangeKmAt(global, date)).toBeCloseTo(mid, 6);
  });

  it('gives a distance in the real Earth-Moon range for the default landing date', () => {
    const km = earthRangeKmAt(global, new Date(Date.UTC(2027, 0, 10, 0, 0)));
    expect(km).toBeGreaterThan(356_000);
    expect(km).toBeLessThan(407_000);
  });

  it('clamps outside the series instead of reading past the arrays', () => {
    expect(earthRangeKmAt(global, new Date(0))).toBeCloseTo(global.earth_range_km[0]!, 6);
    const far = new Date(Date.parse(global.start) + 1e12);
    expect(earthRangeKmAt(global, far)).toBeCloseTo(global.earth_range_km.at(-1)!, 6);
  });
});
