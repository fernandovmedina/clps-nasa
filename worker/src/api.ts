import {
  computeScenario,
  sampleRange,
  sphericalHorizon,
  trackFromGlobal,
  type EphemerisResponse,
  type ScenarioResponse,
} from '@touchdown/core'
import {
  fetchAsset,
  getGlobal,
  getHorizon,
  getSitesFile,
  getTrack,
  requireSite,
  requireTerrain,
  seriesEndMs,
} from './data'
import { HttpError, badRequest, errorResponse, jsonResponse, notFound } from './http'
import {
  parseDurationDays,
  parseId,
  parseInstant,
  parseLatitude,
  parseLongitude,
  parseStepMinutes,
} from './params'

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS'
const CACHE_CONTROL = 'public, max-age=300'
const MAX_SAMPLES = 2000
const DEFAULT_RANGE_DAYS = 30
const DEFAULT_DURATION_DAYS = 14
const DAY_MS = 86_400_000
const MINUTE_MS = 60_000
const SITE_ROUTE = /^\/api\/sites\/([^/]+)\/(horizon|ephemeris|terrain)$/

function optional(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined
}

function required(url: URL, name: string): string {
  const value = optional(url, name)
  if (value === undefined) throw badRequest(`${name} is required`)
  return value
}

async function horizonResponse(env: Cloudflare.Env, id: string): Promise<Response> {
  await requireSite(env, id)
  const asset = await fetchAsset(env, `/data/horizons/${id}.json`)
  if (!asset.ok) throw notFound(`site '${id}' has no horizon`)
  return new Response(asset.body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE_CONTROL },
  })
}

async function ephemeris(env: Cloudflare.Env, id: string, url: URL): Promise<EphemerisResponse> {
  await requireSite(env, id)
  const [track, horizon] = await Promise.all([getTrack(env, id), getHorizon(env, id)])
  const first = track.startMs
  const last = seriesEndMs(track)

  const startParam = optional(url, 'start')
  const endParam = optional(url, 'end')
  const stepParam = optional(url, 'step')
  const startMs = startParam === undefined ? first : parseInstant(startParam, 'start')
  const endMs =
    endParam === undefined
      ? Math.min(startMs + DEFAULT_RANGE_DAYS * DAY_MS, last)
      : parseInstant(endParam, 'end')
  const stepMinutes = stepParam === undefined ? 60 : parseStepMinutes(stepParam)

  if (startMs < first || endMs > last) throw badRequest('the requested range is outside the ephemeris series')
  if (endMs < startMs) throw badRequest('end must not be before start')
  const count = Math.floor((endMs - startMs) / (stepMinutes * MINUTE_MS)) + 1
  if (count > MAX_SAMPLES) throw badRequest(`the range would return ${count} samples; the limit is ${MAX_SAMPLES}`)

  return {
    site_id: id,
    step_minutes: stepMinutes,
    source: track.source,
    samples: sampleRange(track, horizon, startMs, endMs, stepMinutes),
  }
}

function parseInclude(url: URL): boolean {
  const include = optional(url, 'include')
  if (include === undefined) return false
  if (include.split(',').some((part) => part !== 'samples')) throw badRequest("include only accepts 'samples'")
  return true
}

async function scenario(env: Cloudflare.Env, url: URL): Promise<ScenarioResponse & { samples?: EphemerisResponse['samples'] }> {
  const siteId = parseId(required(url, 'site'), 'site')
  const durationParam = optional(url, 'duration_days')
  const landingParam = optional(url, 'landing')
  const withSamples = parseInclude(url)
  const durationDays = durationParam === undefined ? DEFAULT_DURATION_DAYS : parseDurationDays(durationParam)

  let site: Parameters<typeof computeScenario>[0]['site']
  let track
  let horizon
  if (siteId === 'custom') {
    const lat = parseLatitude(required(url, 'lat'))
    const lon = parseLongitude(required(url, 'lon'))
    site = { id: 'custom', name: 'Custom site', horizon_source: 'spherical', ephemeris_source: 'jpl-horizons' }
    track = trackFromGlobal(await getGlobal(env), { id: 'custom', lat, lon, elevation_m: 0 })
    horizon = sphericalHorizon('custom')
  } else {
    site = await requireSite(env, siteId)
    ;[track, horizon] = await Promise.all([getTrack(env, siteId), getHorizon(env, siteId)])
  }

  const landingMs = landingParam === undefined ? track.startMs : parseInstant(landingParam, 'landing')
  if (landingMs < track.startMs || landingMs > seriesEndMs(track)) {
    throw badRequest('landing is outside the ephemeris series')
  }

  const result = computeScenario({
    site,
    track,
    horizon,
    landing: new Date(landingMs).toISOString(),
    durationDays,
  })
  if (!withSamples) return result
  return {
    ...result,
    samples: sampleRange(track, horizon, landingMs, landingMs + durationDays * DAY_MS, 60),
  }
}

async function route(request: Request, env: Cloudflare.Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname

  if (path === '/api/health') {
    const file = await getSitesFile(env)
    return jsonResponse({
      ok: true,
      service: 'touchdown',
      sites_count: file.sites.length,
      generated_at: file.generated_at,
    })
  }
  if (path === '/api/sites') return jsonResponse((await getSitesFile(env)).sites)
  if (path === '/api/scenario') return jsonResponse(await scenario(env, url))

  const match = SITE_ROUTE.exec(path)
  if (match !== null) {
    const id = parseId(match[1]!, 'id')
    switch (match[2]) {
      case 'horizon':
        return horizonResponse(env, id)
      case 'ephemeris':
        return jsonResponse(await ephemeris(env, id, url))
      default:
        return jsonResponse(await requireTerrain(env, id))
    }
  }
  throw notFound(`no API route for ${path}`)
}

async function respond(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-methods': ALLOWED_METHODS,
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(
      new HttpError(405, 'METHOD_NOT_ALLOWED', `${request.method} is not allowed`, { allow: ALLOWED_METHODS }),
    )
  }
  try {
    const response = await route(request, env)
    if (!response.headers.has('cache-control')) response.headers.set('cache-control', CACHE_CONTROL)
    return response
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error)
    console.error(error)
    return errorResponse(new HttpError(500, 'INTERNAL_ERROR', 'unexpected error'))
  }
}

export async function handleApi(request: Request, env: Cloudflare.Env): Promise<Response> {
  const response = await respond(request, env)
  response.headers.set('access-control-allow-origin', '*')
  return request.method === 'HEAD' ? new Response(null, response) : response
}
