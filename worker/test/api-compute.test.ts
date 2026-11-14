import { describe, expect, it } from 'vitest'
import {
  computeScenario,
  sampleRange,
  sphericalHorizon,
  trackFromFile,
  trackFromGlobal,
  type EphemerisFile,
  type EphemerisResponse,
  type GlobalFile,
  type HorizonFile,
  type ScenarioResponse,
  type SitesFile,
} from '@touchdown/core'
import { call, getJson, loadAsset, type ErrorBody } from './helpers'

const LANDING = '2027-01-10T00:00:00Z'

async function expectBadRequest(path: string): Promise<void> {
  const { res, body } = await getJson<ErrorBody>(path)
  expect(res.status, path).toBe(400)
  expect(body.error.code, path).toBe('INVALID_PARAMETER')
  expect(body.error.message.length, path).toBeGreaterThan(0)
}

describe('GET /api/sites/:id/ephemeris', () => {
  const base = '/api/sites/malapert-a/ephemeris'

  it('returns 25 complete hourly samples for one day', async () => {
    const { res, body } = await getJson<EphemerisResponse>(
      `${base}?start=2027-01-10T00:00:00Z&end=2027-01-11T00:00:00Z&step=1h`,
    )
    expect(res.status).toBe(200)
    expect(body.site_id).toBe('malapert-a')
    expect(body.step_minutes).toBe(60)
    expect(typeof body.source).toBe('string')
    expect(body.samples).toHaveLength(25)
    expect(body.samples[0]!.t).toBe('2027-01-10T00:00:00Z')
    expect(body.samples[24]!.t).toBe('2027-01-11T00:00:00Z')
    for (const sample of body.samples) {
      for (const part of [sample.sun, sample.earth]) {
        expect(typeof part.az).toBe('number')
        expect(typeof part.el).toBe('number')
        expect(typeof part.visible).toBe('boolean')
      }
    }
  })

  it('matches core sampleRange over the same files', async () => {
    const file = await loadAsset<EphemerisFile>('/data/ephemeris/malapert-a.json')
    const horizon = await loadAsset<HorizonFile>('/data/horizons/malapert-a.json')
    const expected = sampleRange(
      trackFromFile(file),
      horizon,
      Date.parse('2027-01-10T00:00:00Z'),
      Date.parse('2027-01-11T00:00:00Z'),
      30,
    )
    const { body } = await getJson<EphemerisResponse>(
      `${base}?start=2027-01-10T00:00:00Z&end=2027-01-11T00:00:00Z&step=30m`,
    )
    expect(body.step_minutes).toBe(30)
    expect(body.samples).toHaveLength(49)
    expect(body.samples).toEqual(expected)
  })

  it('supports a daily step', async () => {
    const { body } = await getJson<EphemerisResponse>(
      `${base}?start=2027-01-10T00:00:00Z&end=2027-01-20T00:00:00Z&step=1d`,
    )
    expect(body.step_minutes).toBe(1440)
    expect(body.samples).toHaveLength(11)
  })

  it('defaults to the first 30 days of the series at one hour', async () => {
    const sitesFile = await loadAsset<SitesFile>('/data/sites.json')
    const { res, body } = await getJson<EphemerisResponse>(base)
    expect(res.status).toBe(200)
    expect(body.step_minutes).toBe(60)
    expect(body.samples).toHaveLength(30 * 24 + 1)
    expect(body.samples[0]!.t).toBe(sitesFile.ephemeris_range.start)
    expect(body.samples[720]!.t).toBe('2026-12-01T00:00:00Z')
  })

  it('rejects an invalid date', async () => {
    await expectBadRequest(`${base}?start=not-a-date&end=2027-01-11T00:00:00Z`)
    await expectBadRequest(`${base}?start=2027-01-10T00:00:00Z&end=2027-02-30T00:00:00Z`)
    await expectBadRequest(`${base}?start=2027-13-10T00:00:00Z`)
    await expectBadRequest(`${base}?start=`)
  })

  it('requires an explicit time zone on date-times and accepts date-only values', async () => {
    await expectBadRequest(`${base}?start=2027-01-10T00:00:00&end=2027-01-11T00:00:00Z`)
    await expectBadRequest(`${base}?start=2027-01-10T00:00:00Z&end=2027-01-11T00:00`)
    const dates = await getJson<EphemerisResponse>(`${base}?start=2027-01-10&end=2027-01-11`)
    expect(dates.res.status).toBe(200)
    expect(dates.body.samples).toHaveLength(25)
    expect(dates.body.samples[0]!.t).toBe('2027-01-10T00:00:00Z')
    const offset = await getJson<EphemerisResponse>(
      `${base}?start=2027-01-10T02:00:00%2B02:00&end=2027-01-11T02:00:00%2B02:00`,
    )
    expect(offset.res.status).toBe(200)
    expect(offset.body.samples[0]!.t).toBe('2027-01-10T00:00:00Z')
  })

  it('rejects a range that exceeds 2000 samples', async () => {
    await expectBadRequest(`${base}?start=2027-01-10T00:00:00Z&end=2027-06-10T00:00:00Z&step=1h`)
    await expectBadRequest(`${base}?step=1m`)
  })

  it('accepts exactly 2000 samples', async () => {
    const { res, body } = await getJson<EphemerisResponse>(
      `${base}?start=2027-01-10T00:00:00Z&end=2027-01-10T00:00:00Z&step=1m`,
    )
    expect(res.status).toBe(200)
    expect(body.samples).toHaveLength(1)
    const edge = await getJson<EphemerisResponse>(
      `${base}?start=2027-01-10T00:00:00Z&end=2027-01-11T09:19:00Z&step=1m`,
    )
    expect(edge.res.status).toBe(200)
    expect(edge.body.samples).toHaveLength(2000)
    await expectBadRequest(`${base}?start=2027-01-10T00:00:00Z&end=2027-01-11T09:20:00Z&step=1m`)
  })

  it('rejects an invalid step', async () => {
    for (const step of ['abc', '0h', '0m', '-1h', '1.5h', '1w', 'h', '', '1s', '30s', '59s', '1000000m']) {
      await expectBadRequest(`${base}?start=2027-01-10T00:00:00Z&end=2027-01-11T00:00:00Z&step=${step}`)
    }
  })

  it('rejects an end before the start and dates outside the series', async () => {
    await expectBadRequest(`${base}?start=2027-01-11T00:00:00Z&end=2027-01-10T00:00:00Z`)
    await expectBadRequest(`${base}?start=2020-01-01T00:00:00Z&end=2020-01-02T00:00:00Z`)
    await expectBadRequest(`${base}?start=2027-01-10T00:00:00Z&end=2031-01-01T00:00:00Z&step=1d`)
  })

  it('answers 404 for an unknown site', async () => {
    const res = await call('/api/sites/nowhere/ephemeris')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/scenario', () => {
  it('computes change-4 over 14 days exactly like core', async () => {
    const sitesFile = await loadAsset<SitesFile>('/data/sites.json')
    const site = sitesFile.sites.find((s) => s.id === 'change-4')!
    const expected = computeScenario({
      site,
      track: trackFromFile(await loadAsset<EphemerisFile>('/data/ephemeris/change-4.json')),
      horizon: await loadAsset<HorizonFile>('/data/horizons/change-4.json'),
      landing: LANDING,
      durationDays: 14,
    })
    const { res, body } = await getJson<ScenarioResponse>(
      `/api/scenario?site=change-4&landing=${LANDING}&duration_days=14`,
    )
    expect(res.status).toBe(200)
    expect(body.fractions.earth).toBe(0)
    expect(body.status).toBe('not_viable')
    expect(body).toEqual(expected)
  })

  it('adds hourly mission samples with include=samples', async () => {
    const plain = await getJson<ScenarioResponse>(
      `/api/scenario?site=malapert-a&landing=${LANDING}&duration_days=14`,
    )
    const { res, body } = await getJson<ScenarioResponse & { samples: EphemerisResponse['samples'] }>(
      `/api/scenario?site=malapert-a&landing=${LANDING}&duration_days=14&include=samples`,
    )
    expect(res.status).toBe(200)
    expect(body.samples).toHaveLength(14 * 24 + 1)
    expect(body.samples[0]!.t).toBe(LANDING)
    expect(body.samples.at(-1)!.t).toBe('2027-01-24T00:00:00Z')
    const { samples: _samples, ...rest } = body
    expect(rest).toEqual(plain.body)
    expect('samples' in plain.body).toBe(false)
  })

  it('requires an explicit time zone on the landing and accepts a date-only landing', async () => {
    await expectBadRequest('/api/scenario?site=malapert-a&landing=2027-01-10T00:00:00')
    await expectBadRequest('/api/scenario?site=malapert-a&landing=2027-01-10T00:00')
    const dateOnly = await getJson<ScenarioResponse>('/api/scenario?site=malapert-a&landing=2027-01-10&duration_days=14')
    const full = await getJson<ScenarioResponse>(`/api/scenario?site=malapert-a&landing=${LANDING}&duration_days=14`)
    expect(dateOnly.res.status).toBe(200)
    expect(dateOnly.body).toEqual(full.body)
  })

  it('rejects an unknown include value', async () => {
    await expectBadRequest(`/api/scenario?site=malapert-a&landing=${LANDING}&include=everything`)
  })

  it('computes a custom site with a spherical horizon', async () => {
    const global = await loadAsset<GlobalFile>('/data/global.json')
    const expected = computeScenario({
      site: {
        id: 'custom',
        name: 'Custom site',
        horizon_source: 'spherical',
        ephemeris_source: 'jpl-horizons',
      },
      track: trackFromGlobal(global, { id: 'custom', lat: -89.9, lon: 0, elevation_m: 0 }),
      horizon: sphericalHorizon('custom'),
      landing: global.start,
      durationDays: 14,
    })
    const { res, body } = await getJson<ScenarioResponse>('/api/scenario?site=custom&lat=-89.9&lon=0')
    expect(res.status).toBe(200)
    expect(body.horizon_source).toBe('spherical')
    expect(body.site_id).toBe('custom')
    expect(body).toEqual(expected)
  })

  it('normalizes longitudes above 180 degrees', async () => {
    const east = await getJson<ScenarioResponse>(
      `/api/scenario?site=custom&lat=-80&lon=270&landing=${LANDING}&duration_days=7`,
    )
    const west = await getJson<ScenarioResponse>(
      `/api/scenario?site=custom&lat=-80&lon=-90&landing=${LANDING}&duration_days=7`,
    )
    expect(east.res.status).toBe(200)
    expect(east.body).toEqual(west.body)
  })

  it('rejects custom coordinates that are missing or out of range', async () => {
    await expectBadRequest('/api/scenario?site=custom&lon=0')
    await expectBadRequest('/api/scenario?site=custom&lat=-89.9')
    await expectBadRequest('/api/scenario?site=custom&lat=&lon=0')
    await expectBadRequest('/api/scenario?site=custom&lat=90.1&lon=0')
    await expectBadRequest('/api/scenario?site=custom&lat=-90.1&lon=0')
    await expectBadRequest('/api/scenario?site=custom&lat=abc&lon=0')
    await expectBadRequest('/api/scenario?site=custom&lat=0&lon=360')
    await expectBadRequest('/api/scenario?site=custom&lat=0&lon=-180.1')
    const edge = await call('/api/scenario?site=custom&lat=-90&lon=-180')
    expect(edge.status).toBe(200)
  })

  it('rejects durations outside (0, 60]', async () => {
    for (const duration of ['0', '61', '-1', '60.5', 'abc', '']) {
      await expectBadRequest(`/api/scenario?site=malapert-a&landing=${LANDING}&duration_days=${duration}`)
    }
    await expectBadRequest('/api/scenario?site=custom&lat=-89.9&lon=0&duration_days=0')
    await expectBadRequest('/api/scenario?site=custom&lat=-89.9&lon=0&duration_days=61')
    const max = await call(`/api/scenario?site=malapert-a&landing=${LANDING}&duration_days=60`)
    expect(max.status).toBe(200)
  })

  it('rejects a missing or malformed site and an invalid landing', async () => {
    await expectBadRequest(`/api/scenario?landing=${LANDING}`)
    await expectBadRequest(`/api/scenario?site=Bad_Site&landing=${LANDING}`)
    await expectBadRequest('/api/scenario?site=malapert-a&landing=yesterday')
    await expectBadRequest('/api/scenario?site=malapert-a&landing=2020-01-01T00:00:00Z')
  })

  it('answers 404 for an unknown catalog site', async () => {
    const { res, body } = await getJson<ErrorBody>(`/api/scenario?site=nowhere&landing=${LANDING}`)
    expect(res.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('flags a mission that runs past the end of the series', async () => {
    const { body } = await getJson<ScenarioResponse>(
      '/api/scenario?site=malapert-a&landing=2027-12-25T00:00:00Z&duration_days=30',
    )
    expect(body.truncated).toBe(true)
  })
})
