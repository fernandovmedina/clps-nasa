import type { GlobalFile } from '@touchdown/core';

export const MEAN_MOON_DISTANCE_KM = 384_400;

type RangeSeries = Pick<GlobalFile, 'start' | 'step_minutes' | 'count' | 'earth_range_km'>;

/** Earth–Moon distance (km) at `date`, interpolated from the JPL Horizons series; null if the series is unusable. */
export function earthMoonDistanceKm(series: RangeSeries, date: Date): number | null {
  const range = series.earth_range_km;
  const startMs = Date.parse(series.start);
  const stepMs = series.step_minutes * 60_000;
  const last = Math.min(series.count, range.length) - 1;
  if (last < 0 || !Number.isFinite(startMs) || !(stepMs > 0)) return null;
  const pos = Math.min(Math.max((date.getTime() - startMs) / stepMs, 0), last);
  const i = Math.floor(pos);
  const a = range[i]!;
  const b = range[Math.min(i + 1, last)]!;
  const km = a + (b - a) * (pos - i);
  return Number.isFinite(km) && km > 0 ? km : null;
}
