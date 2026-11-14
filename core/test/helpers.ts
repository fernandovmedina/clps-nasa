import type { HorizonFile, Track } from '../src/index'

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
export const START_ISO = '2027-01-10T00:00:00Z'
export const START_MS = Date.parse(START_ISO)

export function isoAt(hours: number): string {
  return new Date(START_MS + hours * HOUR_MS).toISOString().replace('.000Z', 'Z')
}

export interface TrackSpec {
  count: number
  stepMs?: number
  sunAz: (i: number) => number
  sunEl: (i: number) => number
  earthAz: (i: number) => number
  earthEl: (i: number) => number
}

export function makeTrack(spec: TrackSpec): Track {
  const idx = Array.from({ length: spec.count }, (_, i) => i)
  return {
    siteId: 'test-site',
    source: 'synthetic',
    startMs: START_MS,
    stepMs: spec.stepMs ?? HOUR_MS,
    count: spec.count,
    sunAz: idx.map(spec.sunAz),
    sunEl: idx.map(spec.sunEl),
    earthAz: idx.map(spec.earthAz),
    earthEl: idx.map(spec.earthEl),
  }
}

export function scenarioATrack(): Track {
  return makeTrack({
    count: 49,
    sunAz: () => 100,
    sunEl: (i) => 2 - (4 * i) / 48,
    earthAz: () => 0,
    earthEl: () => 5,
  })
}

export function flatHorizon(deg: number): HorizonFile {
  return {
    site_id: 'test-site',
    az_step_deg: 0.5,
    horizon_deg: Array.from({ length: 720 }, () => deg),
    observer_height_m: 0,
    source: 'synthetic',
    max_range_km: 300,
  }
}

export const TEST_SITE = {
  id: 'test-site',
  name: 'Test site',
  horizon_source: 'lola' as const,
  ephemeris_source: 'jpl-horizons',
}
