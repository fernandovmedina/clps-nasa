import { describe, expect, it } from 'vitest'
import {
  computeScenario,
  sampleRange,
  visibilityWindows,
  type HorizonFile,
} from '../src/index'
import {
  DAY_MS,
  HOUR_MS,
  START_ISO,
  START_MS,
  TEST_SITE,
  flatHorizon,
  isoAt,
  makeTrack,
  scenarioATrack,
} from './helpers'

function run(
  horizon: HorizonFile,
  durationDays: number,
  track = scenarioATrack(),
  landing = START_ISO,
) {
  return computeScenario({ site: TEST_SITE, track, horizon, landing, durationDays })
}

describe('scenario A: Sun sets at hour 24, Earth always visible', () => {
  const r = run(flatHorizon(0), 2)

  it('reports the contract identity fields', () => {
    expect(r.site_id).toBe('test-site')
    expect(r.site_name).toBe('Test site')
    expect(r.landing).toBe(START_ISO)
    expect(r.duration_days).toBe(2)
    expect(r.horizon_source).toBe('lola')
    expect(r.ephemeris_source).toBe('jpl-horizons')
    expect(r.truncated).toBe(false)
  })

  it('finds the windows', () => {
    expect(r.windows.sun).toEqual([[START_ISO, isoAt(24)]])
    expect(r.windows.earth).toEqual([[START_ISO, isoAt(48)]])
    expect(r.windows.both).toEqual([[START_ISO, isoAt(24)]])
  })

  it('sums visible hours and fractions', () => {
    expect(r.sun.hours_visible).toBe(24)
    expect(r.earth.hours_visible).toBe(48)
    expect(r.fractions).toEqual({ sun: 0.5, earth: 1, both: 0.5 })
  })

  it('scores and classifies', () => {
    expect(r.score).toBe(75)
    expect(r.status).toBe('viable')
  })

  it('finds the next events', () => {
    expect(r.sun.next_set).toBe(isoAt(24))
    expect(r.sun.next_rise).toBeNull()
    expect(r.earth.next_set).toBeNull()
    expect(r.earth.next_rise).toBeNull()
  })

  it('summarizes the state at landing', () => {
    expect(r.sun.az_now).toBe(100)
    expect(r.sun.elev_now).toBe(2)
    expect(r.sun.visible_now).toBe(true)
    expect(r.earth.az_now).toBe(0)
    expect(r.earth.elev_now).toBe(5)
    expect(r.earth.visible_now).toBe(true)
  })

  it('computes elevation statistics over the evaluation points', () => {
    expect(r.sun.max_elev).toBe(2)
    expect(r.sun.min_elev).toBe(-2)
    expect(r.sun.avg_elev).toBe(0)
    expect(r.earth.max_elev).toBe(5)
    expect(r.earth.min_elev).toBe(5)
    expect(r.earth.avg_elev).toBe(5)
  })
})

describe('scenario B: 1 degree horizon', () => {
  const r = run(flatHorizon(1), 2)

  it('sets the Sun at hour 12', () => {
    expect(r.windows.sun).toEqual([[START_ISO, isoAt(12)]])
    expect(r.sun.next_set).toBe(isoAt(12))
    expect(r.fractions.sun).toBe(0.25)
  })

  it('is marginal with score 63', () => {
    expect(r.score).toBe(63)
    expect(r.status).toBe('marginal')
  })
})

describe('scenario C: Earth hidden behind a ridge', () => {
  const horizon = flatHorizon(0)
  for (let i = 0; i <= 40; i++) horizon.horizon_deg[i] = 5
  const track = makeTrack({
    count: 49,
    sunAz: () => 100,
    sunEl: (i) => 2 - (4 * i) / 48,
    earthAz: () => 10,
    earthEl: () => 3,
  })
  const r = run(horizon, 2, track)

  it('never sees the Earth', () => {
    expect(r.fractions.earth).toBe(0)
    expect(r.earth.hours_visible).toBe(0)
    expect(r.earth.visible_now).toBe(false)
    expect(r.windows.earth).toEqual([])
    expect(r.windows.both).toEqual([])
  })

  it('is not viable', () => {
    expect(r.status).toBe('not_viable')
  })
})

describe('status thresholds', () => {
  function withEarthEl(earthEl: (i: number) => number) {
    return makeTrack({
      count: 49,
      sunAz: () => 100,
      sunEl: (i) => 2 - (4 * i) / 48,
      earthAz: () => 0,
      earthEl,
    })
  }

  it('is viable at exactly score 70 with half of the mission in both', () => {
    const track = withEarthEl((i) => (i <= 42 ? 5 : i === 43 ? 1 : -4))
    const r = run(flatHorizon(0), 2, track)
    expect(r.fractions).toEqual({ sun: 0.5, earth: 0.9, both: 0.5 })
    expect(r.score).toBe(70)
    expect(r.status).toBe('viable')
  })

  it('is marginal at exactly score 40', () => {
    const track = withEarthEl((i) => (i <= 13 ? 5 : i === 14 ? 2 : -3))
    const r = run(flatHorizon(0), 2, track)
    expect(r.fractions).toEqual({ sun: 0.5, earth: 0.3, both: 0.3 })
    expect(r.score).toBe(40)
    expect(r.status).toBe('marginal')
  })

  it('is marginal when the score is high but the windows barely overlap', () => {
    const track = makeTrack({
      count: 49,
      sunAz: () => 100,
      sunEl: (i) => (i < 24 ? 5 : -5),
      earthAz: () => 0,
      earthEl: (i) => (i < 24 ? -5 : 5),
    })
    const r = run(flatHorizon(0), 2, track)
    expect(r.fractions.both).toBe(0)
    expect(r.score).toBe(50)
    expect(r.status).toBe('marginal')
  })

  it('is marginal when a body is visible 15 percent of the mission', () => {
    const track = makeTrack({
      count: 49,
      sunAz: () => 100,
      sunEl: () => 5,
      earthAz: () => 0,
      earthEl: (i) => (i <= 6 ? 5 : i === 7 ? 2 : -8),
    })
    const r = run(flatHorizon(0), 2, track)
    expect(r.fractions).toEqual({ sun: 1, earth: 0.15, both: 0.15 })
    expect(r.status).toBe('marginal')
  })

  it('is not viable when a body is visible less than 10 percent even with a passing score', () => {
    const track = makeTrack({
      count: 49,
      sunAz: () => 100,
      sunEl: () => 5,
      earthAz: () => 0,
      earthEl: (i) => (i <= 3 ? 5 : i === 4 ? 8 : -17),
    })
    const r = run(flatHorizon(0), 2, track)
    expect(r.fractions).toEqual({ sun: 1, earth: 0.09, both: 0.09 })
    expect(r.score).toBe(55)
    expect(r.status).toBe('not_viable')
  })
})

describe('evaluation points', () => {
  it('includes every sample inside a mission that starts between samples', () => {
    const spike = makeTrack({
      count: 25,
      sunAz: () => 100,
      sunEl: (i) => (i === 7 ? 10 : 0),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(-1), 0.25, spike, isoAt(6.5))
    expect(r.sun.max_elev).toBe(10)
    expect(r.sun.min_elev).toBe(0)
  })

  it('does not double count a sample that coincides with a mission end', () => {
    const r = run(flatHorizon(0), 1, scenarioATrack())
    expect(r.sun.avg_elev).toBe(1)
  })
})

describe('score rounding', () => {
  it('rounds an exact .5 score up from the published fractions', () => {
    const track = makeTrack({
      count: 1001,
      sunAz: () => 100,
      sunEl: (i) => (i < 100 ? 1 : i === 100 ? 0 : -1),
      earthAz: () => 0,
      earthEl: (i) => (i < 690 ? 1 : i === 690 ? 0 : -1),
    })
    const r = run(flatHorizon(0), 1000 / 24, track)
    expect(r.fractions.sun).toBe(0.1)
    expect(r.fractions.earth).toBe(0.69)
    expect(r.score).toBe(40)
    expect(r.status).toBe('marginal')
  })
})

describe('grazing horizon', () => {
  const grazing = makeTrack({
    count: 3,
    sunAz: () => 100,
    sunEl: (i) => (i === 1 ? 0 : 1),
    earthAz: () => 0,
    earthEl: () => 5,
  })

  it('does not invent a set and a rise at a zero margin with positive neighbours', () => {
    const r = run(flatHorizon(0), 2 / 24, grazing)
    expect(r.windows.sun).toEqual([[START_ISO, isoAt(2)]])
    expect(r.sun.next_set).toBeNull()
    expect(r.sun.next_rise).toBeNull()
    expect(r.sun.hours_visible).toBe(2)
    expect(r.fractions.sun).toBe(1)
  })

  it('gives one window from visibilityWindows too', () => {
    const w = visibilityWindows(grazing, flatHorizon(0), START_MS, START_MS + 2 * HOUR_MS)
    expect(w.sun).toEqual([[START_ISO, isoAt(2)]])
    expect(w.both).toEqual([[START_ISO, isoAt(2)]])
  })

  it('still reports a set that happens exactly at a zero margin', () => {
    const r = run(flatHorizon(0), 1, scenarioATrack())
    expect(r.sun.next_set).toBe(isoAt(24))
  })
})

describe('landing date format', () => {
  it.each(['2027-01-10T00:00:00', '2027-01-10 00:00', 'Jan 10 2027'])(
    'rejects %s',
    (landing) => {
      expect(() => run(flatHorizon(0), 1, scenarioATrack(), landing)).toThrow(RangeError)
    },
  )

  it('accepts a zone designator in UTC or as an offset', () => {
    expect(run(flatHorizon(0), 1, scenarioATrack(), '2027-01-10T00:00:00Z').landing).toBe(START_ISO)
    expect(run(flatHorizon(0), 1, scenarioATrack(), '2027-01-09T18:00:00-06:00').landing).toBe(START_ISO)
  })
})

describe('published azimuth', () => {
  function azTrack(az: number) {
    return makeTrack({
      count: 3,
      sunAz: () => az,
      sunEl: () => 5,
      earthAz: () => az,
      earthEl: () => 5,
    })
  }

  it.each([360, 359.996, 359.9951])('keeps az_now below 360 for %s', (az) => {
    const r = run(flatHorizon(0), 1 / 24, azTrack(az))
    expect(r.earth.az_now).toBe(0)
    expect(r.sun.az_now).toBe(0)
  })

  it.each([360, 359.996])('keeps sampleRange azimuth below 360 for %s', (az) => {
    const s = sampleRange(azTrack(az), flatHorizon(0), START_MS, START_MS + HOUR_MS)
    expect(s[0]!.sun.az).toBe(0)
    expect(s[0]!.earth.az).toBe(0)
  })

  it('leaves ordinary azimuths alone', () => {
    const r = run(flatHorizon(0), 1 / 24, azTrack(359.994))
    expect(r.earth.az_now).toBe(359.99)
  })
})

describe('windows after rounding to the minute', () => {
  it('omits a window shorter than a minute', () => {
    const blip = makeTrack({
      count: 3,
      sunAz: () => 100,
      sunEl: (i) => (i === 1 ? 0.001 : -1),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 2 / 24, blip)
    expect(r.windows.sun).toEqual([])
    expect(r.windows.both).toEqual([])
    expect(r.sun.hours_visible).toBe(0)
    expect(r.fractions.sun).toBe(0.001)
  })

  it('merges windows separated by less than half a minute', () => {
    const dip = makeTrack({
      count: 3,
      sunAz: () => 100,
      sunEl: (i) => (i === 1 ? -0.001 : 1),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 2 / 24, dip)
    expect(r.windows.sun).toEqual([[START_ISO, isoAt(2)]])
    expect(r.windows.both).toEqual([[START_ISO, isoAt(2)]])
    expect(r.sun.hours_visible).toBe(2)
    expect(r.fractions.sun).toBe(0.999)
  })
})

describe('long series', () => {
  it('computes statistics over 150000 samples without overflowing the stack', () => {
    const count = 150_000
    const track = makeTrack({
      count,
      stepMs: 60_000,
      sunAz: () => 100,
      sunEl: (i) => Math.sin(i / 100),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), (count - 1) / 1440, track)
    expect(r.sun.max_elev).toBe(1)
    expect(r.sun.min_elev).toBe(-1)
  })
})

describe('scenario D: range handling', () => {
  it('rejects a landing before the series', () => {
    expect(() => run(flatHorizon(0), 2, scenarioATrack(), isoAt(-1))).toThrow(RangeError)
  })

  it('rejects a landing after the series', () => {
    expect(() => run(flatHorizon(0), 1, scenarioATrack(), isoAt(49))).toThrow(RangeError)
  })

  it('rejects an invalid landing or duration', () => {
    expect(() => run(flatHorizon(0), 1, scenarioATrack(), 'not a date')).toThrow(RangeError)
    expect(() => run(flatHorizon(0), 0)).toThrow(RangeError)
    expect(() => run(flatHorizon(0), Number.NaN)).toThrow(RangeError)
  })

  it('truncates a mission that runs past the series', () => {
    const r = run(flatHorizon(0), 3)
    expect(r.truncated).toBe(true)
    expect(r.duration_days).toBe(3)
    expect(r.fractions).toEqual({ sun: 0.5, earth: 1, both: 0.5 })
  })

  it('does not truncate a mission that ends exactly at the series end', () => {
    expect(run(flatHorizon(0), 2).truncated).toBe(false)
  })

  it('measures fractions against the evaluated part of a truncated mission', () => {
    const r = run(flatHorizon(0), 5, scenarioATrack(), isoAt(12))
    expect(r.truncated).toBe(true)
    expect(r.windows.sun).toEqual([[isoAt(12), isoAt(24)]])
    expect(r.sun.hours_visible).toBe(12)
    expect(r.fractions.sun).toBe(0.333)
  })

  it('handles a landing on the last sample as an empty mission', () => {
    const r = run(flatHorizon(0), 1, scenarioATrack(), isoAt(48))
    expect(r.truncated).toBe(true)
    expect(r.fractions).toEqual({ sun: 0, earth: 0, both: 0 })
    expect(r.status).toBe('not_viable')
  })
})

describe('next events', () => {
  it('searches past the end of the mission', () => {
    const r = run(flatHorizon(0), 0.5)
    expect(r.windows.sun).toEqual([[START_ISO, isoAt(12)]])
    expect(r.sun.next_set).toBe(isoAt(24))
  })

  it('reports the next rise when the Sun is down at landing', () => {
    const track = makeTrack({
      count: 49,
      sunAz: () => 100,
      sunEl: (i) => -2 + (4 * i) / 48,
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 1, track)
    expect(r.sun.visible_now).toBe(false)
    expect(r.sun.next_rise).toBe(isoAt(24))
    expect(r.sun.next_set).toBeNull()
    expect(r.windows.sun).toEqual([])
  })

  it('ignores a crossing exactly at landing', () => {
    const rising = makeTrack({
      count: 49,
      sunAz: () => 100,
      sunEl: (i) => -2 + (4 * i) / 48,
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 1, rising, isoAt(24))
    expect(r.sun.visible_now).toBe(false)
    expect(r.sun.next_rise).toBeNull()
    expect(r.sun.next_set).toBeNull()
  })

  it('returns the first set and the first rise in a repeating series', () => {
    const track = makeTrack({
      count: 25,
      sunAz: () => 100,
      sunEl: (i) => (i % 8 < 4 ? 3 : -3),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 0.5, track)
    expect(r.sun.next_set).toBe('2027-01-10T03:30:00Z')
    expect(r.sun.next_rise).toBe('2027-01-10T07:30:00Z')
  })
})

describe('sub-hourly crossing', () => {
  const track = makeTrack({
    count: 2,
    sunAz: () => 100,
    sunEl: (i) => (i === 0 ? 1 : -1),
    earthAz: () => 0,
    earthEl: () => 5,
  })

  it('sets 30 minutes in', () => {
    const r = run(flatHorizon(0), 1 / 24, track)
    expect(r.sun.next_set).toBe('2027-01-10T00:30:00Z')
    expect(r.windows.sun).toEqual([[START_ISO, '2027-01-10T00:30:00Z']])
    expect(r.sun.hours_visible).toBe(0.5)
  })

  it('places an asymmetric crossing by linear interpolation of the margin', () => {
    const skewed = makeTrack({
      count: 2,
      sunAz: () => 100,
      sunEl: (i) => (i === 0 ? 3 : -1),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 1 / 24, skewed)
    expect(r.sun.next_set).toBe('2027-01-10T00:45:00Z')
    expect(r.sun.hours_visible).toBe(0.8)
  })

  it('rounds event times to the minute', () => {
    const skewed = makeTrack({
      count: 2,
      sunAz: () => 100,
      sunEl: (i) => (i === 0 ? 1 : -2),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const r = run(flatHorizon(0), 1 / 24, skewed)
    expect(r.sun.next_set).toBe('2027-01-10T00:20:00Z')
  })
})

describe('visibilityWindows', () => {
  it('uses interpolated end points between samples', () => {
    const w = visibilityWindows(
      scenarioATrack(),
      flatHorizon(0),
      START_MS + 6 * HOUR_MS + 30 * 60_000,
      START_MS + 30 * HOUR_MS,
    )
    expect(w.sun).toEqual([['2027-01-10T06:30:00Z', isoAt(24)]])
    expect(w.earth).toEqual([['2027-01-10T06:30:00Z', isoAt(30)]])
    expect(w.both).toEqual(w.sun)
  })

  it('keeps separate windows apart with exact limits', () => {
    const track = makeTrack({
      count: 9,
      sunAz: () => 100,
      sunEl: (i) => (i % 4 < 2 ? 3 : -3),
      earthAz: () => 0,
      earthEl: () => 5,
    })
    const w = visibilityWindows(track, flatHorizon(0), START_MS, START_MS + 8 * HOUR_MS)
    expect(w.sun).toEqual([
      [START_ISO, '2027-01-10T01:30:00Z'],
      ['2027-01-10T03:30:00Z', '2027-01-10T05:30:00Z'],
      ['2027-01-10T07:30:00Z', '2027-01-10T08:00:00Z'],
    ])
    expect(w.both).toEqual(w.sun)
  })

  it('returns empty windows for an empty interval and rejects bad ranges', () => {
    expect(visibilityWindows(scenarioATrack(), flatHorizon(0), START_MS, START_MS).sun).toEqual([])
    expect(() =>
      visibilityWindows(scenarioATrack(), flatHorizon(0), START_MS, START_MS - 1),
    ).toThrow(RangeError)
    expect(() =>
      visibilityWindows(scenarioATrack(), flatHorizon(0), START_MS, START_MS + 49 * HOUR_MS),
    ).toThrow(RangeError)
  })
})

describe('sampleRange', () => {
  it('samples at the track step by default and flags visibility', () => {
    const s = sampleRange(scenarioATrack(), flatHorizon(0), START_MS, START_MS + 48 * HOUR_MS)
    expect(s).toHaveLength(49)
    expect(s[0]).toEqual({
      t: START_ISO,
      sun: { az: 100, el: 2, visible: true },
      earth: { az: 0, el: 5, visible: true },
    })
    expect(s[24]!.sun).toEqual({ az: 100, el: 0, visible: false })
    expect(s[48]!.sun.visible).toBe(false)
  })

  it('honours a custom step and rounds angles to two decimals', () => {
    const s = sampleRange(scenarioATrack(), flatHorizon(0), START_MS, START_MS + 2 * HOUR_MS, 30)
    expect(s.map((x) => x.t)).toEqual([
      START_ISO,
      '2027-01-10T00:30:00Z',
      '2027-01-10T01:00:00Z',
      '2027-01-10T01:30:00Z',
      '2027-01-10T02:00:00Z',
    ])
    expect(s[1]!.sun.el).toBe(1.96)
  })

  it('skips instants outside the series and rejects a non-positive step', () => {
    const s = sampleRange(scenarioATrack(), flatHorizon(0), START_MS - 2 * HOUR_MS, START_MS + HOUR_MS)
    expect(s.map((x) => x.t)).toEqual([START_ISO, isoAt(1)])
    expect(() => sampleRange(scenarioATrack(), flatHorizon(0), START_MS, START_MS + DAY_MS, 0)).toThrow(
      RangeError,
    )
  })
})
