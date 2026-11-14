// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { computeScenario, trackFromFile, type EphemerisFile, type HorizonFile, type SitesFile } from '@touchdown/core'
import { describe, expect, it } from 'vitest'
import {
  computeCalendar,
  computeDay,
  countStatuses,
  dayIndexAt,
  dayPosition,
  landingDays,
  monthTicks,
  type DayCell,
} from './calendar'
import type { SiteData } from './data'

const DAY = 86_400_000

describe('calendar strip', () => {
  it('lists one landing per UTC midnight, both ends included', () => {
    const start = Date.parse('2026-11-01T00:00:00Z')
    const days = landingDays(start, start + 3 * DAY)
    expect(days).toEqual([start, start + DAY, start + 2 * DAY, start + 3 * DAY])
  })

  it('starts at the next midnight when the range starts mid-day and skips a partial last day', () => {
    const start = Date.parse('2026-11-01T06:00:00Z')
    const days = landingDays(start, start + 2 * DAY)
    expect(days).toEqual([Date.parse('2026-11-02T00:00:00Z'), Date.parse('2026-11-03T00:00:00Z')])
    expect(days.every((ms) => ms % DAY === 0)).toBe(true)
  })

  it('maps a pointer position to a day index and clamps the edges', () => {
    expect(dayIndexAt(0, 400, 40)).toBe(0)
    expect(dayIndexAt(399.9, 400, 40)).toBe(39)
    expect(dayIndexAt(-20, 400, 40)).toBe(0)
    expect(dayIndexAt(900, 400, 40)).toBe(39)
    expect(dayIndexAt(205, 400, 40)).toBe(20)
    expect(dayIndexAt(10, 0, 40)).toBe(0)
    expect(dayIndexAt(10, 400, 0)).toBe(0)
  })

  it('positions a marker at the middle of its day', () => {
    const first = Date.parse('2026-11-01T00:00:00Z')
    expect(dayPosition(first, first, 100)).toBe(0.5)
    expect(dayPosition(first + 3 * DAY, first, 100)).toBe(3.5)
    expect(dayPosition(first - 10 * DAY, first, 100)).toBe(0)
    expect(dayPosition(first + 500 * DAY, first, 100)).toBe(100)
  })

  it('marks the first day and every first of the month', () => {
    const first = Date.parse('2026-11-20T00:00:00Z')
    const days = Array.from({ length: 50 }, (_, i) => first + i * DAY)
    const ticks = monthTicks(days)
    expect(ticks.map((t) => new Date(t.ms).toISOString().slice(0, 10))).toEqual(['2026-11-20', '2026-12-01', '2027-01-01'])
    expect(ticks.map((t) => t.index)).toEqual([0, 11, 42])
  })

  it('counts statuses and ignores days without data', () => {
    const cells: DayCell[] = [
      { ms: 0, status: 'viable', score: 90 },
      { ms: DAY, status: 'viable', score: 80 },
      { ms: 2 * DAY, status: 'marginal', score: 60 },
      { ms: 3 * DAY, status: null, score: 0 },
      { ms: 4 * DAY, status: 'not_viable', score: 10 },
    ]
    expect(countStatuses(cells)).toEqual({ viable: 2, marginal: 1, not_viable: 1 })
  })
})

const dataDir = fileURLToPath(new URL('../../public/data/', import.meta.url))
const hasData = existsSync(`${dataDir}sites.json`)

function load<T>(relative: string): T {
  return JSON.parse(readFileSync(`${dataDir}${relative}`, 'utf8')) as T
}

describe.skipIf(!hasData)('calendar against the core engine', () => {
  const sites = hasData ? load<SitesFile>('sites.json') : null
  const site = sites?.sites.find((s) => s.id === 'malapert-a')
  const track = hasData ? trackFromFile(load<EphemerisFile>('ephemeris/malapert-a.json')) : null
  const horizon = hasData ? load<HorizonFile>('horizons/malapert-a.json') : null
  const data: SiteData | null =
    site && track && horizon
      ? {
          info: {
            id: site.id,
            name: site.name,
            program: site.program,
            region: site.region,
            lat: site.lat,
            lon: site.lon,
            horizonSource: site.horizon_source,
            ephemerisSource: site.ephemeris_source,
            approx: false,
            custom: false,
          },
          track,
          horizon,
          seriesEndMs: track.startMs + (track.count - 1) * track.stepMs,
        }
      : null

  it('reports for each day the status and score that computeScenario returns', () => {
    const ms = Date.parse('2027-01-10T00:00:00Z')
    const cell = computeDay(data!, ms, 14)
    const expected = computeScenario({
      site: { id: site!.id, name: site!.name, horizon_source: site!.horizon_source, ephemeris_source: site!.ephemeris_source },
      track: track!,
      horizon: horizon!,
      landing: '2027-01-10T00:00:00Z',
      durationDays: 14,
    })
    expect(cell).toEqual({ ms, status: expected.status, score: expected.score })
  })

  it('covers every landing day of the ephemeris range with a result', async () => {
    const cells = await computeCalendar('malapert-a', data!, 14)
    expect(cells).toHaveLength(landingDays(track!.startMs, data!.seriesEndMs).length)
    expect(cells.every((c) => c.status !== null)).toBe(true)
    expect(cells[0]?.ms).toBe(track!.startMs)
  })

  it('memoises the result per site and duration', async () => {
    const first = computeCalendar('malapert-a', data!, 14)
    const second = computeCalendar('malapert-a', data!, 14)
    expect(second).toBe(first)
    expect(computeCalendar('malapert-a', data!, 7)).not.toBe(first)
  })
}, 60_000)
