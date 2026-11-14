import {
  sphericalHorizon,
  trackFromFile,
  trackFromGlobal,
  type EphemerisFile,
  type GlobalFile,
  type HorizonFile,
  type Site,
  type SitesFile,
  type Track,
} from '@touchdown/core'
import type { SiteRef } from './types'

export class UnknownSiteError extends Error {
  constructor(label: string) {
    super(`unknown site: ${label}`)
    this.name = 'UnknownSiteError'
  }
}

const cache = new Map<string, Promise<unknown>>()

export function loadJson<T>(path: string): Promise<T> {
  const hit = cache.get(path)
  if (hit) return hit as Promise<T>
  const request = fetch(path).then((res) => {
    if (!res.ok) throw new Error(`${path}: ${res.status}`)
    return res.json() as Promise<T>
  })
  cache.set(path, request)
  request.catch(() => cache.delete(path))
  return request
}

export const loadSites = () => loadJson<SitesFile>('/data/sites.json')
export const loadGlobal = () => loadJson<GlobalFile>('/data/global.json')

export interface SiteInfo {
  id: string
  name: string | null
  program: string
  region: Site['region'] | null
  lat: number
  lon: number
  horizonSource: 'lola' | 'spherical'
  ephemerisSource: string
  approx: boolean
  custom: boolean
}

export interface SiteData {
  info: SiteInfo
  track: Track
  horizon: HorizonFile
  seriesEndMs: number
}

const trackCache = new Map<string, Track>()

function seriesEnd(track: Track): number {
  return track.startMs + (track.count - 1) * track.stepMs
}

export async function loadSiteData(ref: SiteRef): Promise<SiteData> {
  if (ref.kind === 'custom') {
    const valid =
      Number.isFinite(ref.lat) && Number.isFinite(ref.lon) && Math.abs(ref.lat) <= 90 && Math.abs(ref.lon) <= 180
    if (!valid) throw new UnknownSiteError(`${ref.lat},${ref.lon}`)
    const global = await loadGlobal()
    const key = `c:${ref.lat},${ref.lon}`
    let track = trackCache.get(key)
    if (!track) {
      track = trackFromGlobal(global, { id: 'custom', lat: ref.lat, lon: ref.lon, elevation_m: 0 })
      trackCache.set(key, track)
    }
    return {
      info: {
        id: 'custom',
        name: null,
        program: '',
        region: null,
        lat: ref.lat,
        lon: ref.lon,
        horizonSource: 'spherical',
        ephemerisSource: global.source,
        approx: false,
        custom: true,
      },
      track,
      horizon: sphericalHorizon('custom'),
      seriesEndMs: seriesEnd(track),
    }
  }

  const sites = await loadSites()
  const site = sites.sites.find((s) => s.id === ref.id)
  if (!site) throw new UnknownSiteError(ref.id)
  const [ephemeris, horizon] = await Promise.all([
    loadJson<EphemerisFile>(`/data/ephemeris/${site.id}.json`),
    loadJson<HorizonFile>(`/data/horizons/${site.id}.json`),
  ])
  let track = trackCache.get(ref.id)
  if (!track) {
    track = trackFromFile(ephemeris)
    trackCache.set(ref.id, track)
  }
  return {
    info: {
      id: site.id,
      name: site.name,
      program: site.program,
      region: site.region,
      lat: site.lat,
      lon: site.lon,
      horizonSource: site.horizon_source,
      ephemerisSource: site.ephemeris_source,
      approx: site.approx === true,
      custom: false,
    },
    track,
    horizon,
    seriesEndMs: seriesEnd(track),
  }
}
