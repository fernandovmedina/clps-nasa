import { describe, expect, it } from 'vitest'
import type { HorizonFile, Site, SitesFile, TerrainInfo } from '@touchdown/core'
import { call, getJson, loadAsset, type ErrorBody } from './helpers'

function expectError(body: ErrorBody, code: string): void {
  expect(body.error.code).toBe(code)
  expect(typeof body.error.message).toBe('string')
  expect(body.error.message.length).toBeGreaterThan(0)
}

describe('GET /api/health', () => {
  it('reports the service and the number of sites', async () => {
    const sitesFile = await loadAsset<SitesFile>('/data/sites.json')
    const { res, body } = await getJson<Record<string, unknown>>('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(body).toEqual({
      ok: true,
      service: 'touchdown',
      sites_count: 10,
      generated_at: sitesFile.generated_at,
    })
  })
})

describe('GET /api/sites', () => {
  it('returns the ten catalog sites with the contract fields', async () => {
    const sitesFile = await loadAsset<SitesFile>('/data/sites.json')
    const { res, body } = await getJson<Site[]>('/api/sites')
    expect(res.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(10)
    for (const site of body) {
      expect(typeof site.id).toBe('string')
      expect(typeof site.name).toBe('string')
      expect(typeof site.program).toBe('string')
      expect(typeof site.lat).toBe('number')
      expect(typeof site.lon).toBe('number')
      expect(typeof site.elevation_m).toBe('number')
      expect(typeof site.has_terrain).toBe('boolean')
    }
    expect(body).toEqual(sitesFile.sites)
    expect(new Set(body.map((s) => s.id)).size).toBe(10)
  })
})

describe('GET /api/sites/:id/horizon', () => {
  it('returns the horizon file untouched', async () => {
    const expected = await loadAsset<HorizonFile>('/data/horizons/malapert-a.json')
    const { res, body } = await getJson<HorizonFile>('/api/sites/malapert-a/horizon')
    expect(res.status).toBe(200)
    expect(body.horizon_deg).toHaveLength(720)
    expect(body).toEqual(expected)
  })

  it('answers 404 with an error body for a site that does not exist', async () => {
    const { res, body } = await getJson<ErrorBody>('/api/sites/nowhere/horizon')
    expect(res.status).toBe(404)
    expectError(body, 'NOT_FOUND')
  })

  it('answers 400 for an id with an invalid shape', async () => {
    const { res, body } = await getJson<ErrorBody>('/api/sites/Malapert_A/horizon')
    expect(res.status).toBe(400)
    expectError(body, 'INVALID_PARAMETER')
    const long = await call(`/api/sites/${'a'.repeat(65)}/horizon`)
    expect(long.status).toBe(400)
  })
})

describe('GET /api/sites/:id/terrain', () => {
  it('returns the terrain entry with a .raw heightmap', async () => {
    const terrains = await loadAsset<Record<string, TerrainInfo>>('/data/terrains.json')
    const { res, body } = await getJson<TerrainInfo>('/api/sites/malapert-a/terrain')
    expect(res.status).toBe(200)
    expect(Object.keys(body).sort()).toEqual(
      [
        'extent_m',
        'format',
        'heightmap_url',
        'max_height_m',
        'min_height_m',
        'site_id',
        'site_px',
        'size_px',
        'texture_url',
      ],
    )
    expect(body.heightmap_url.endsWith('.raw')).toBe(true)
    expect(body).toEqual(terrains['malapert-a'])
  })

  it('serves the referenced heightmap from the assets', async () => {
    const { body } = await getJson<TerrainInfo>('/api/sites/malapert-a/terrain')
    const raw = await call(body.heightmap_url)
    expect(raw.status).toBe(200)
    expect((await raw.arrayBuffer()).byteLength).toBe(body.size_px * body.size_px * 2)
  })

  it('answers 404 for a site without terrain', async () => {
    const { res, body } = await getJson<ErrorBody>('/api/sites/apollo-11/terrain')
    expect(res.status).toBe(404)
    expectError(body, 'NOT_FOUND')
    const unknown = await call('/api/sites/nowhere/terrain')
    expect(unknown.status).toBe(404)
  })
})

describe('routing, methods and headers', () => {
  it('serves non-API paths from the assets', async () => {
    const sitesFile = await loadAsset<SitesFile>('/data/sites.json')
    const res = await call('/data/sites.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual(sitesFile)
  })

  it('rejects methods other than GET, HEAD and OPTIONS with 405', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await call('/api/sites', { method })
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      expectError((await res.json()) as ErrorBody, 'METHOD_NOT_ALLOWED')
    }
  })

  it('answers preflight requests', async () => {
    const res = await call('/api/sites', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, HEAD, OPTIONS')
  })

  it('answers HEAD without a body', async () => {
    const res = await call('/api/health', { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.text()).toBe('')
  })

  it('sets CORS and cache headers on API responses', async () => {
    const ok = await call('/api/sites')
    expect(ok.headers.get('access-control-allow-origin')).toBe('*')
    expect(ok.headers.get('cache-control')).toBe('public, max-age=300')
    const missing = await call('/api/sites/nowhere/horizon')
    expect(missing.headers.get('access-control-allow-origin')).toBe('*')
    expect(missing.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 404 with an error body for unknown API routes', async () => {
    for (const path of ['/api', '/api/nothing', '/api/sites/malapert-a', '/api/sites/malapert-a/other']) {
      const { res, body } = await getJson<ErrorBody>(path)
      expect(res.status).toBe(404)
      expectError(body, 'NOT_FOUND')
    }
  })

  it('accepts a trailing slash', async () => {
    const res = await call('/api/sites/')
    expect(res.status).toBe(200)
  })
})
