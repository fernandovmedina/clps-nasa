import type { ScenarioResponse } from '@touchdown/core'
import { describe, expect, it } from 'vitest'
import { translate } from '@/control/i18n'
import { bothHours, buildMarkdown, longestSunNightHours, pickRecommended, riskText, risksFor, type ReportEntry } from './report'

const DAY_MS = 86_400_000
const LANDING = Date.parse('2027-01-10T00:00:00Z')

function response(overrides: Partial<ScenarioResponse> = {}): ScenarioResponse {
  const body = { az_now: 0, elev_now: 5, visible_now: true, hours_visible: 336, max_elev: 12, min_elev: 1, avg_elev: 6, next_set: null, next_rise: null }
  return {
    site_id: 'x',
    site_name: 'X',
    landing: '2027-01-10T00:00:00Z',
    duration_days: 14,
    horizon_source: 'lola',
    ephemeris_source: 'jpl-horizons',
    truncated: false,
    sun: body,
    earth: body,
    windows: {
      sun: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
      earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
      both: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
    },
    fractions: { sun: 1, earth: 1, both: 1 },
    metrics: { energy: 1, comms: 1, ops: 1, continuity: 1, longest_dark_h: 0 },
    score: 80,
    status: 'viable',
    ...overrides,
  }
}

function entry(letter: string, overrides: Partial<ReportEntry> = {}, res: Partial<ScenarioResponse> = {}): ReportEntry {
  return {
    letter,
    name: `Site ${letter}`,
    landingMs: LANDING,
    durationDays: 14,
    missionHours: 336,
    response: response(res),
    approx: false,
    horizonSource: 'lola',
    ...overrides,
  }
}

describe('recommendation', () => {
  it('returns null without entries', () => {
    expect(pickRecommended([])).toBeNull()
  })

  it('picks the highest score', () => {
    const best = pickRecommended([entry('A', {}, { score: 50 }), entry('B', {}, { score: 74 }), entry('C', {}, { score: 60 })])
    expect(best?.letter).toBe('B')
  })

  it('breaks score ties by hours with both bodies visible', () => {
    const a = entry('A', {}, { score: 70, fractions: { sun: 1, earth: 1, both: 0.4 } })
    const b = entry('B', {}, { score: 70, fractions: { sun: 1, earth: 1, both: 0.6 } })
    expect(bothHours(b)).toBeGreaterThan(bothHours(a))
    expect(pickRecommended([a, b])?.letter).toBe('B')
  })

  it('breaks remaining ties by the earliest landing date', () => {
    const late = entry('A', { landingMs: LANDING + 5 * DAY_MS })
    const early = entry('B', { landingMs: LANDING })
    expect(pickRecommended([late, early])?.letter).toBe('B')
    expect(pickRecommended([early, late])?.letter).toBe('B')
  })

  it('keeps the first entry when everything ties', () => {
    expect(pickRecommended([entry('A'), entry('B')])?.letter).toBe('A')
  })
})

describe('risk rules', () => {
  it('flags nothing for a clean scenario', () => {
    expect(risksFor(entry('A'))).toEqual([])
  })

  it('flags an Earth that is never visible', () => {
    const risks = risksFor(entry('A', {}, { windows: { sun: [], earth: [], both: [] }, fractions: { sun: 1, earth: 0, both: 0 } }))
    expect(risks).toContainEqual({ id: 'earthNever' })
  })

  it('reports the first cutoff when the Earth sets during the mission', () => {
    const cut = '2027-01-15T06:00:00Z'
    const risks = risksFor(
      entry('A', {}, {
        windows: { sun: [], earth: [['2027-01-10T00:00:00Z', cut]], both: [] },
        fractions: { sun: 1, earth: 0.4, both: 0.4 },
      }),
    )
    expect(risks).toContainEqual({ id: 'earthBelow', whenMs: Date.parse(cut) })
  })

  it('reports the first rise when the Earth is hidden at landing', () => {
    const rise = '2027-01-12T00:00:00Z'
    const risks = risksFor(
      entry('A', {}, {
        windows: { sun: [], earth: [[rise, '2027-01-24T00:00:00Z']], both: [] },
        fractions: { sun: 1, earth: 0.85, both: 0.85 },
      }),
    )
    expect(risks).toContainEqual({ id: 'earthStart', whenMs: Date.parse(rise) })
  })

  it('flags a low Sun below 5 degrees of maximum elevation', () => {
    const low = response().sun
    expect(risksFor(entry('A', {}, { sun: { ...low, max_elev: 4.9 } }))).toContainEqual({ id: 'sunLow', elevation: 4.9 })
    expect(risksFor(entry('A', {}, { sun: { ...low, max_elev: 5 } })).some((r) => r.id === 'sunLow')).toBe(false)
  })

  it('flags truncation, spherical horizon and approximate coordinates', () => {
    const ids = risksFor(entry('A', { approx: true, horizonSource: 'spherical' }, { truncated: true })).map((r) => r.id)
    expect(ids).toEqual(['truncated', 'spherical', 'approx'])
  })

  it('flags solar under-horizon time with percentage and longest continuous night', () => {
    const malapertLike = entry(
      'A',
      {},
      {
        windows: {
          sun: [['2027-01-10T00:00:00Z', '2027-01-16T15:24:00Z']],
          earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
          both: [],
        },
        fractions: { sun: 0.475, earth: 1, both: 0.475 },
      },
    )
    expect(risksFor(malapertLike)).toContainEqual({ id: 'sunBelow', percent: 53, longestNightHours: 176.6 })

    const multiGap = entry(
      'B',
      {},
      {
        windows: {
          sun: [
            ['2027-01-09T12:00:00Z', '2027-01-11T00:00:00Z'],
            ['invalid', '2027-01-12T00:00:00Z'],
            ['2027-01-13T12:00:00Z', '2027-01-15T00:00:00Z'],
            ['2027-01-20T18:00:00Z', '2027-01-22T06:00:00Z'],
          ],
          earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
          both: [],
        },
        fractions: { sun: 0.286, earth: 1, both: 0.286 },
      },
    )
    expect(risksFor(multiGap)).toContainEqual({ id: 'sunBelow', percent: 71, longestNightHours: 138 })

    const polarNight = entry(
      'C',
      {},
      {
        windows: { sun: [], earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']], both: [] },
        fractions: { sun: 0, earth: 1, both: 0 },
      },
    )
    expect(risksFor(polarNight)).toContainEqual({ id: 'sunBelow', percent: 100, longestNightHours: 336 })

    const briefEclipse = entry(
      'D',
      {},
      {
        windows: {
          sun: [
            ['2027-01-10T00:00:00Z', '2027-01-23T23:00:00Z'],
          ],
          earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
          both: [],
        },
        fractions: { sun: 0.996, earth: 1, both: 0.996 },
      },
    )
    expect(risksFor(briefEclipse)).toContainEqual({ id: 'sunBelow', percent: 1, longestNightHours: 1 })
    expect(longestSunNightHours(entry('E', { missionHours: 0 }))).toBe(0)
    expect(
      risksFor(
        entry(
          'F',
          { missionHours: 0 },
          {
            windows: { sun: [], earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']], both: [] },
            fractions: { sun: 0, earth: 1, both: 0 },
          },
        ),
      ).some((r) => r.id === 'sunBelow'),
    ).toBe(false)

    const unsorted = entry(
      'G',
      {},
      {
        windows: {
          sun: [
            ['2027-01-20T18:00:00Z', '2027-01-22T06:00:00Z'],
            ['2027-01-10T00:00:00Z', '2027-01-11T00:00:00Z'],
            ['2027-01-13T12:00:00Z', '2027-01-15T00:00:00Z'],
          ],
          earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
          both: [],
        },
        fractions: { sun: 0.286, earth: 1, both: 0.286 },
      },
    )
    expect(longestSunNightHours(unsorted)).toBe(138)
  })

  it('renders the sunBelow risk text in both Spanish and English', () => {
    const tEs = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('es', key, vars)
    const tEn = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)
    const risk = { id: 'sunBelow', percent: 53, longestNightHours: 176.6 } as const
    expect(riskText(tEs, 'es-MX', risk)).toBe('Sol bajo el horizonte 53 % de la misión (noche continua más larga: 176.6 h).')
    expect(riskText(tEn, 'en-US', risk)).toBe('Sun below the horizon 53% of the mission (longest continuous night: 176.6 h).')
  })
})

describe('markdown summary', () => {
  it('lists the recommendation, the comparison table and the risks', () => {
    const entries = [
      entry('A', {}, { score: 50, status: 'not_viable' }),
      entry('B', { approx: true }, { score: 74, status: 'marginal' }),
    ]
    const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)
    const md = buildMarkdown(entries, pickRecommended(entries), 21, t, 'en-US')
    expect(md.startsWith('# Mission summary')).toBe(true)
    expect(md).toContain('Delay applied: 21 days.')
    expect(md).toContain('**Recommended scenario:** B')
    expect(md).toContain('| Scenario | Site |')
    expect(md.split('\n').filter((l) => /^\| [AB] \|/.test(l))).toHaveLength(2)
    expect(md).toContain('### B · Site B')
    expect(md).toContain('- Approximate coordinates.')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('includes the solar night risk line in markdown when sun fraction is below 1', () => {
    const entries = [
      entry(
        'A',
        {},
        {
          windows: {
            sun: [['2027-01-10T00:00:00Z', '2027-01-16T15:24:00Z']],
            earth: [['2027-01-10T00:00:00Z', '2027-01-24T00:00:00Z']],
            both: [],
          },
          fractions: { sun: 0.475, earth: 1, both: 0.475 },
        },
      ),
    ]
    const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)
    const md = buildMarkdown(entries, pickRecommended(entries), 0, t, 'en-US')
    expect(md).toContain('- Sun below the horizon 53% of the mission (longest continuous night: 176.6 h).')
  })
})
