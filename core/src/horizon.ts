import type { HorizonFile } from './types'
import { wrapDegrees } from './time'

export function horizonAt(h: HorizonFile, azDeg: number): number {
  const n = h.horizon_deg.length
  if (n === 0) throw new RangeError('horizon has no samples')
  const pos = wrapDegrees(azDeg) / h.az_step_deg
  const i = Math.floor(pos)
  const frac = pos - i
  const a = h.horizon_deg[i % n]!
  const b = h.horizon_deg[(i + 1) % n]!
  return a + (b - a) * frac
}

export function sphericalHorizon(siteId: string): HorizonFile {
  return {
    site_id: siteId,
    az_step_deg: 0.5,
    horizon_deg: Array.from({ length: 720 }, () => 0),
    observer_height_m: 0,
    source: 'spherical',
    max_range_km: 0,
  }
}
