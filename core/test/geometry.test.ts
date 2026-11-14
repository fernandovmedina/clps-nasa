import { describe, expect, it } from 'vitest'
import { MOON_RADIUS_M, topocentric } from '../src/index'

describe('topocentric', () => {
  it('places a body 23.47 degrees away on the equator to the west at 66.426 degrees', () => {
    const r = topocentric(0, 23.47, 0, 0, 0, 384400)
    expect(r.az).toBeCloseTo(270, 3)
    expect(Math.abs(r.el - 66.426)).toBeLessThan(0.005)
  })

  it('puts a distant Sun due north at 10 degrees from -80 latitude', () => {
    const r = topocentric(-80, 0, 0, 0, 0, Infinity)
    expect(Math.abs(r.az - 0)).toBeLessThan(1e-6)
    expect(Math.abs(r.el - 10)).toBeLessThan(1e-6)
  })

  it('puts a distant Sun due east on the horizon when the sub-point is 90 degrees east', () => {
    const r = topocentric(-80, 0, 0, 0, 90, Infinity)
    expect(Math.abs(r.az - 90)).toBeLessThan(1e-6)
    expect(Math.abs(r.el - 0)).toBeLessThan(1e-6)
  })

  it('puts the Earth deep below the horizon on the opposite hemisphere', () => {
    expect(topocentric(0, 180, 0, 0, 0, 384400).el).toBeLessThan(-85)
  })

  it('returns azimuth in [0, 360)', () => {
    for (const lon of [-170, -90, -10, 10, 90, 170]) {
      const { az } = topocentric(-45, lon, 1500, -10, 0, Infinity)
      expect(az).toBeGreaterThanOrEqual(0)
      expect(az).toBeLessThan(360)
    }
  })

  it('puts a body at the zenith when the sub-point is the site itself', () => {
    expect(topocentric(-30, 40, 500, -30, 40, 384400).el).toBeCloseTo(90, 6)
    expect(topocentric(-30, 40, 500, -30, 40, Infinity).el).toBeCloseTo(90, 6)
  })

  it('exposes the lunar radius', () => {
    expect(MOON_RADIUS_M).toBe(1_737_400)
  })
})
