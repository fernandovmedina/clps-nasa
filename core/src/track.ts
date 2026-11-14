import { topocentric } from './geometry'
import { MINUTE_MS, shortArcDelta, wrapDegrees } from './time'
import type { EphemerisFile, GlobalFile, Track } from './types'

function seriesStart(start: string, stepMinutes: number, count: number, lengths: number[]): number {
  const startMs = Date.parse(start)
  if (!Number.isFinite(startMs)) throw new RangeError(`invalid series start: ${start}`)
  if (!(stepMinutes > 0) || !Number.isFinite(stepMinutes)) {
    throw new RangeError(`invalid step_minutes: ${stepMinutes}`)
  }
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`invalid count: ${count}`)
  if (lengths.some((n) => n !== count)) throw new RangeError('series arrays do not match count')
  return startMs
}

export function trackFromFile(e: EphemerisFile): Track {
  const startMs = seriesStart(e.start, e.step_minutes, e.count, [
    e.sun_az.length,
    e.sun_el.length,
    e.earth_az.length,
    e.earth_el.length,
  ])
  return {
    siteId: e.site_id,
    source: e.source,
    startMs,
    stepMs: e.step_minutes * MINUTE_MS,
    count: e.count,
    sunAz: e.sun_az,
    sunEl: e.sun_el,
    earthAz: e.earth_az,
    earthEl: e.earth_el,
  }
}

export function trackFromGlobal(
  g: GlobalFile,
  site: { id: string; lat: number; lon: number; elevation_m: number },
): Track {
  const startMs = seriesStart(g.start, g.step_minutes, g.count, [
    g.sub_earth_lon.length,
    g.sub_earth_lat.length,
    g.sub_solar_lon.length,
    g.sub_solar_lat.length,
    g.earth_range_km.length,
  ])
  const sunAz: number[] = []
  const sunEl: number[] = []
  const earthAz: number[] = []
  const earthEl: number[] = []
  for (let i = 0; i < g.count; i++) {
    const sun = topocentric(
      site.lat,
      site.lon,
      site.elevation_m,
      g.sub_solar_lat[i]!,
      g.sub_solar_lon[i]!,
      Infinity,
    )
    const earth = topocentric(
      site.lat,
      site.lon,
      site.elevation_m,
      g.sub_earth_lat[i]!,
      g.sub_earth_lon[i]!,
      g.earth_range_km[i]!,
    )
    sunAz.push(sun.az)
    sunEl.push(sun.el)
    earthAz.push(earth.az)
    earthEl.push(earth.el)
  }
  return {
    siteId: site.id,
    source: g.source,
    startMs,
    stepMs: g.step_minutes * MINUTE_MS,
    count: g.count,
    sunAz,
    sunEl,
    earthAz,
    earthEl,
  }
}

export function seriesEndMs(track: Track): number {
  return track.startMs + (track.count - 1) * track.stepMs
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

function lerpAzimuth(a: number, b: number, f: number): number {
  return f === 0 ? a : wrapDegrees(a + shortArcDelta(a, b) * f)
}

export function positionAt(
  track: Track,
  tMs: number,
): { sun: { az: number; el: number }; earth: { az: number; el: number } } | null {
  if (track.count < 1 || !(tMs >= track.startMs)) return null
  const pos = (tMs - track.startMs) / track.stepMs
  const last = track.count - 1
  if (pos > last) return null
  const i = Math.min(Math.floor(pos), last)
  const f = i === last ? 0 : pos - i
  const j = Math.min(i + 1, last)
  return {
    sun: {
      az: lerpAzimuth(track.sunAz[i]!, track.sunAz[j]!, f),
      el: lerp(track.sunEl[i]!, track.sunEl[j]!, f),
    },
    earth: {
      az: lerpAzimuth(track.earthAz[i]!, track.earthAz[j]!, f),
      el: lerp(track.earthEl[i]!, track.earthEl[j]!, f),
    },
  }
}
