import { describe, expect, it } from 'vitest'
import { horizonAt, sphericalHorizon } from '../src/index'
import { flatHorizon } from './helpers'

describe('horizonAt', () => {
  const h = flatHorizon(1)
  h.horizon_deg[0] = 4
  h.horizon_deg[719] = 2

  it('wraps between the last and the first value', () => {
    expect(horizonAt(h, 359.75)).toBeCloseTo(3, 12)
  })

  it('returns exact values on grid points', () => {
    expect(horizonAt(h, 0)).toBe(4)
    expect(horizonAt(h, 359.5)).toBe(2)
    expect(horizonAt(h, 100)).toBe(1)
  })

  it('interpolates linearly between grid points', () => {
    expect(horizonAt(h, 0.25)).toBeCloseTo(2.5, 12)
  })

  it('normalizes azimuths outside [0, 360)', () => {
    expect(horizonAt(h, 360)).toBe(4)
    expect(horizonAt(h, -0.25)).toBeCloseTo(3, 12)
    expect(horizonAt(h, 720.25)).toBeCloseTo(2.5, 12)
  })
})

describe('sphericalHorizon', () => {
  it('is 720 zeros every half degree labelled spherical', () => {
    const h = sphericalHorizon('custom')
    expect(h.site_id).toBe('custom')
    expect(h.az_step_deg).toBe(0.5)
    expect(h.horizon_deg).toHaveLength(720)
    expect(h.horizon_deg.every((v) => v === 0)).toBe(true)
    expect(h.source).toBe('spherical')
  })
})
