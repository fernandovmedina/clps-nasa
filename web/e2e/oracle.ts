import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  computeScenario,
  trackFromFile,
  type EphemerisFile,
  type HorizonFile,
  type ScenarioResponse,
  type SitesFile,
} from '@touchdown/core'

const dataDir = fileURLToPath(new URL('../public/data/', import.meta.url))

function load<T>(relative: string): T {
  return JSON.parse(readFileSync(`${dataDir}${relative}`, 'utf8')) as T
}

export function expected(siteId: string, landing: string, durationDays: number): ScenarioResponse {
  const site = load<SitesFile>('sites.json').sites.find((s) => s.id === siteId)
  if (!site) throw new Error(`unknown site ${siteId}`)
  return computeScenario({
    site: { id: site.id, name: site.name, horizon_source: site.horizon_source, ephemeris_source: site.ephemeris_source },
    track: trackFromFile(load<EphemerisFile>(`ephemeris/${siteId}.json`)),
    horizon: load<HorizonFile>(`horizons/${siteId}.json`),
    landing,
    durationDays,
  })
}

export function ephemerisStartMs(): number {
  return Date.parse(load<SitesFile>('sites.json').ephemeris_range.start)
}
