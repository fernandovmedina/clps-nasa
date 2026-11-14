import {
  trackFromFile,
  type EphemerisFile,
  type GlobalFile,
  type HorizonFile,
  type Site,
  type SitesFile,
  type TerrainInfo,
  type Track,
} from '@touchdown/core'
import { notFound } from './http'

const ASSET_ORIGIN = 'http://assets.internal'

const cache = new Map<string, Promise<unknown>>()

function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key)
  if (hit === undefined) {
    hit = load().catch((error: unknown) => {
      cache.delete(key)
      throw error
    })
    cache.set(key, hit)
  }
  return hit as Promise<T>
}

export function fetchAsset(env: Cloudflare.Env, path: string): Promise<Response> {
  return env.ASSETS.fetch(`${ASSET_ORIGIN}${path}`)
}

async function readJson<T>(env: Cloudflare.Env, path: string): Promise<T> {
  const res = await fetchAsset(env, path)
  if (!res.ok) throw new Error(`asset ${path} answered ${res.status}`)
  return (await res.json()) as T
}

export const getSitesFile = (env: Cloudflare.Env): Promise<SitesFile> =>
  memo('sites', () => readJson<SitesFile>(env, '/data/sites.json'))

export const getGlobal = (env: Cloudflare.Env): Promise<GlobalFile> =>
  memo('global', () => readJson<GlobalFile>(env, '/data/global.json'))

export const getHorizon = (env: Cloudflare.Env, id: string): Promise<HorizonFile> =>
  memo(`horizon:${id}`, () => readJson<HorizonFile>(env, `/data/horizons/${id}.json`))

export const getTrack = (env: Cloudflare.Env, id: string): Promise<Track> =>
  memo(`track:${id}`, async () => trackFromFile(await readJson<EphemerisFile>(env, `/data/ephemeris/${id}.json`)))

const getTerrains = (env: Cloudflare.Env): Promise<Record<string, TerrainInfo>> =>
  memo('terrains', () => readJson<Record<string, TerrainInfo>>(env, '/data/terrains.json'))

export async function requireSite(env: Cloudflare.Env, id: string): Promise<Site> {
  const site = (await getSitesFile(env)).sites.find((s) => s.id === id)
  if (site === undefined) throw notFound(`site '${id}' does not exist`)
  return site
}

export async function requireTerrain(env: Cloudflare.Env, id: string): Promise<TerrainInfo> {
  await requireSite(env, id)
  const terrain = (await getTerrains(env))[id]
  if (terrain === undefined) throw notFound(`site '${id}' has no terrain`)
  return terrain
}

export function seriesEndMs(track: Track): number {
  return track.startMs + (track.count - 1) * track.stepMs
}
