import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  computeScenario,
  trackFromFile,
  trackFromGlobal,
  type EphemerisFile,
  type GlobalFile,
  type HorizonFile,
  type SitesFile,
} from '../src/index'

const dataDir = fileURLToPath(new URL('../../web/public/data/', import.meta.url))
const hasData = existsSync(`${dataDir}global.json`) && existsSync(`${dataDir}sites.json`)

function load<T>(relative: string): T {
  return JSON.parse(readFileSync(`${dataDir}${relative}`, 'utf8')) as T
}

function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

describe.skipIf(!hasData)('real data', () => {
  const sitesFile = hasData ? load<SitesFile>('sites.json') : null
  const global = hasData ? load<GlobalFile>('global.json') : null

  describe.each(['malapert-a', 'apollo-11', 'change-4'])('%s', (id) => {
    it('matches the Horizons observer ephemeris from the global sub-points', () => {
      const site = sitesFile!.sites.find((s) => s.id === id)
      expect(site).toBeDefined()
      const fromFile = trackFromFile(load<EphemerisFile>(`ephemeris/${id}.json`))
      const fromGlobal = trackFromGlobal(global!, site!)
      expect(fromGlobal.count).toBe(fromFile.count)
      expect(fromGlobal.startMs).toBe(fromFile.startMs)
      expect(fromGlobal.stepMs).toBe(fromFile.stepMs)

      const samples = 300
      let worstEl = 0
      let worstAz = 0
      for (let k = 0; k < samples; k++) {
        const i = Math.floor((k * (fromFile.count - 1)) / (samples - 1))
        for (const body of ['sun', 'earth'] as const) {
          const az = `${body}Az` as const
          const el = `${body}El` as const
          const refEl = fromFile[el][i]!
          worstEl = Math.max(worstEl, Math.abs(fromGlobal[el][i]! - refEl))
          worstAz = Math.max(
            worstAz,
            Math.abs(angleDiff(fromGlobal[az][i]!, fromFile[az][i]!)) * Math.cos((refEl * Math.PI) / 180),
          )
        }
      }
      expect(worstEl).toBeLessThan(0.2)
      expect(worstAz).toBeLessThan(0.3)
    })
  })

  function scenarioFor(id: string, landing: string, durationDays: number) {
    const site = sitesFile!.sites.find((s) => s.id === id)!
    return computeScenario({
      site,
      track: trackFromFile(load<EphemerisFile>(`ephemeris/${id}.json`)),
      horizon: load<HorizonFile>(`horizons/${id}.json`),
      landing,
      durationDays,
    })
  }

  it('scores mons-mouton from the real horizon and ephemeris', () => {
    const r = scenarioFor('mons-mouton', '2027-03-27T02:03:27Z', 30)
    expect(r.score).toBe(43)
  })

  it('sees one continuous sun window across the shackleton-ridge horizon graze', () => {
    const r = scenarioFor('shackleton-ridge', '2027-03-07T00:00:00Z', 14)
    expect(r.windows.sun).toHaveLength(1)
    const [from, to] = r.windows.sun[0]!
    const grazing = Date.parse('2027-03-14T12:00:00Z')
    expect(Date.parse(from)).toBeLessThanOrEqual(grazing)
    expect(Date.parse(to)).toBeGreaterThanOrEqual(grazing)
    expect(r.sun.next_set).toBe('2027-03-17T16:54:00Z')
  })

  it('never sees the Earth from change-4 for a 14 day mission', () => {
    const site = sitesFile!.sites.find((s) => s.id === 'change-4')!
    const r = computeScenario({
      site,
      track: trackFromFile(load<EphemerisFile>('ephemeris/change-4.json')),
      horizon: load<HorizonFile>('horizons/change-4.json'),
      landing: '2027-01-10T00:00:00Z',
      durationDays: 14,
    })
    expect(r.fractions.earth).toBe(0)
    expect(r.status).toBe('not_viable')
  })
})
