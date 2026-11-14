import { describe, expect, it } from 'vitest'
import {
  positionAt,
  topocentric,
  trackFromFile,
  trackFromGlobal,
  type EphemerisFile,
  type GlobalFile,
} from '../src/index'
import { HOUR_MS, START_ISO, START_MS, makeTrack } from './helpers'

describe('positionAt', () => {
  it('goes through north when azimuth passes from 359 to 1 degrees', () => {
    const track = makeTrack({
      count: 2,
      sunAz: (i) => (i === 0 ? 359 : 1),
      sunEl: () => 10,
      earthAz: () => 0,
      earthEl: () => 0,
    })
    const p = positionAt(track, START_MS + HOUR_MS / 2)
    expect(p).not.toBeNull()
    expect(p!.sun.az).toBeCloseTo(0, 9)
    expect(p!.sun.el).toBe(10)
  })

  it('goes the short way in the opposite direction too', () => {
    const track = makeTrack({
      count: 2,
      sunAz: (i) => (i === 0 ? 1 : 359),
      sunEl: () => 0,
      earthAz: () => 0,
      earthEl: () => 0,
    })
    const p = positionAt(track, START_MS + HOUR_MS / 4)
    expect(p!.sun.az).toBeCloseTo(0.5, 9)
  })

  it('interpolates linearly in elevation and azimuth', () => {
    const track = makeTrack({
      count: 3,
      sunAz: (i) => 10 * i,
      sunEl: (i) => 4 * i,
      earthAz: (i) => 100 + i,
      earthEl: (i) => -i,
    })
    const p = positionAt(track, START_MS + 1.5 * HOUR_MS)!
    expect(p.sun.az).toBeCloseTo(15, 9)
    expect(p.sun.el).toBeCloseTo(6, 9)
    expect(p.earth.az).toBeCloseTo(101.5, 9)
    expect(p.earth.el).toBeCloseTo(-1.5, 9)
  })

  it('returns the exact samples at both ends', () => {
    const track = makeTrack({
      count: 3,
      sunAz: (i) => 10 * i,
      sunEl: (i) => i,
      earthAz: () => 0,
      earthEl: () => 0,
    })
    expect(positionAt(track, START_MS)!.sun.az).toBe(0)
    expect(positionAt(track, START_MS + 2 * HOUR_MS)!.sun.az).toBe(20)
  })

  it('returns null outside the series', () => {
    const track = makeTrack({
      count: 3,
      sunAz: () => 0,
      sunEl: () => 0,
      earthAz: () => 0,
      earthEl: () => 0,
    })
    expect(positionAt(track, START_MS - 1)).toBeNull()
    expect(positionAt(track, START_MS + 2 * HOUR_MS + 1)).toBeNull()
    expect(positionAt(track, Number.NaN)).toBeNull()
  })
})

describe('trackFromFile', () => {
  const file: EphemerisFile = {
    site_id: 'x',
    source: 'JPL Horizons',
    start: START_ISO,
    step_minutes: 30,
    count: 3,
    sun_az: [1, 2, 3],
    sun_el: [4, 5, 6],
    earth_az: [7, 8, 9],
    earth_el: [10, 11, 12],
  }

  it('maps the file to a track', () => {
    const t = trackFromFile(file)
    expect(t).toEqual({
      siteId: 'x',
      source: 'JPL Horizons',
      startMs: START_MS,
      stepMs: 30 * 60_000,
      count: 3,
      sunAz: [1, 2, 3],
      sunEl: [4, 5, 6],
      earthAz: [7, 8, 9],
      earthEl: [10, 11, 12],
    })
  })

  it('rejects files whose arrays do not match count', () => {
    expect(() => trackFromFile({ ...file, count: 4 })).toThrow(RangeError)
    expect(() => trackFromFile({ ...file, earth_el: [1] })).toThrow(RangeError)
  })

  it('rejects an invalid start or step', () => {
    expect(() => trackFromFile({ ...file, start: 'nope' })).toThrow(RangeError)
    expect(() => trackFromFile({ ...file, step_minutes: 0 })).toThrow(RangeError)
  })
})

describe('trackFromGlobal', () => {
  const global: GlobalFile = {
    source: 'JPL Horizons',
    start: START_ISO,
    step_minutes: 60,
    count: 3,
    sub_earth_lon: [0, 10, 20],
    sub_earth_lat: [0, 1, 2],
    sub_solar_lon: [0, 90, 180],
    sub_solar_lat: [0, 0, 0],
    earth_range_km: [384400, 384000, 383000],
  }
  const site = { id: 'cust', lat: -80, lon: 0, elevation_m: 100 }

  it('applies topocentric to every sample', () => {
    const t = trackFromGlobal(global, site)
    expect(t.siteId).toBe('cust')
    expect(t.startMs).toBe(START_MS)
    expect(t.stepMs).toBe(HOUR_MS)
    expect(t.count).toBe(3)
    for (let i = 0; i < 3; i++) {
      const sun = topocentric(-80, 0, 100, 0, global.sub_solar_lon[i]!, Infinity)
      const earth = topocentric(
        -80,
        0,
        100,
        global.sub_earth_lat[i]!,
        global.sub_earth_lon[i]!,
        global.earth_range_km[i]!,
      )
      expect(t.sunAz[i]).toBeCloseTo(sun.az, 12)
      expect(t.sunEl[i]).toBeCloseTo(sun.el, 12)
      expect(t.earthAz[i]).toBeCloseTo(earth.az, 12)
      expect(t.earthEl[i]).toBeCloseTo(earth.el, 12)
    }
  })

  it('rejects arrays that do not match count', () => {
    expect(() => trackFromGlobal({ ...global, earth_range_km: [1] }, site)).toThrow(RangeError)
  })
})
