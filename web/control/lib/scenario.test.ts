import { trackFromFile, type EphemerisFile, type HorizonFile } from '@touchdown/core'
import { describe, expect, it } from 'vitest'
import { readPublicJson } from '@/control/test/realData'
import type { SiteData } from './data'
import { bodiesAt, maskedBy } from './scenario'

describe('maskedBy', () => {
  it('reports the LOLA horizon and the gap for a body above 0° but below the relief', () => {
    expect(maskedBy({ az: 10, el: 1.3, horizonEl: 7, visible: false })).toEqual({ el: 1.3, horizonEl: 7, gap: 5.7 })
  })

  it('is null when the body is visible, below 0° or exactly on the horizon line', () => {
    expect(maskedBy({ az: 10, el: 8, horizonEl: 7, visible: true })).toBeNull()
    expect(maskedBy({ az: 10, el: -2, horizonEl: 7, visible: false })).toBeNull()
    expect(maskedBy({ az: 10, el: 0, horizonEl: 7, visible: false })).toBeNull()
  })
})

describe('bodiesAt with the real nobile-rim-2 data', () => {
  const data = {
    track: trackFromFile(readPublicJson<EphemerisFile>('/data/ephemeris/nobile-rim-2.json')),
    horizon: readPublicJson<HorizonFile>('/data/horizons/nobile-rim-2.json'),
  } as SiteData

  it('has the Earth at 1.30° behind a 6.99° LOLA horizon on 2027-01-10T00:00Z', () => {
    const bodies = bodiesAt(data, Date.parse('2027-01-10T00:00:00Z'))
    expect(bodies).not.toBeNull()
    const earth = bodies!.earth
    expect(earth.el).toBeCloseTo(1.3, 2)
    expect(earth.horizonEl).toBeCloseTo(6.99, 2)
    expect(earth.visible).toBe(false)
    const masked = maskedBy(earth)
    expect(masked).not.toBeNull()
    expect(masked!.gap).toBeCloseTo(5.69, 2)
  })
})
