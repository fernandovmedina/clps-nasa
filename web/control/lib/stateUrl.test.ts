import { describe, expect, it } from 'vitest'
import { decodeState, encodeState, parseSite } from './stateUrl'
import { defaultState, type AppState } from './types'

const FULL: AppState = {
  scenarios: [
    { site: { kind: 'catalog', id: 'change-4' }, landing: '2027-03-05T06:30:00Z', durationDays: 21 },
    { site: { kind: 'custom', lat: -89.9, lon: 0 }, landing: '2027-01-10T00:00:00Z', durationDays: 14 },
    { site: { kind: 'custom', lat: 12.3457, lon: -170.5 }, landing: '2028-01-01T00:00:00Z', durationDays: 1 },
  ],
  selected: 2,
  delayDays: 21,
  cursorHours: 96,
}

describe('state codec', () => {
  it('round-trips the default state', () => {
    const state = defaultState()
    expect(decodeState(encodeState(state))).toEqual(state)
  })

  it('round-trips a state with custom sites, delay, cursor and selection', () => {
    expect(decodeState(encodeState(FULL))).toEqual(FULL)
  })

  it('accepts a leading question mark and produces a stable encoding', () => {
    const query = encodeState(FULL)
    expect(encodeState(decodeState(`?${query}`))).toBe(query)
  })

  it('writes the delay into the query only when it is not zero', () => {
    expect(encodeState(defaultState())).not.toContain('delay')
    expect(encodeState({ ...defaultState(), delayDays: 21 })).toContain('delay=21')
  })

  it('falls back to the default scenarios for empty or unusable input but keeps valid extras', () => {
    expect(decodeState('')).toEqual(defaultState())
    expect(decodeState('s=%E0%A4%A')).toEqual(defaultState())
    expect(decodeState('s=nonsense&s=~~').scenarios).toEqual(defaultState().scenarios)
    expect(decodeState('delay=21').delayDays).toBe(21)
    expect(decodeState('delay=21').scenarios).toEqual(defaultState().scenarios)
  })

  it('drops invalid scenarios and keeps the valid ones', () => {
    const state = decodeState(
      [
        's=malapert-a~2027-01-10T00:00Z~14',
        's=Bad_Id~2027-01-10T00:00Z~14',
        's=apollo-11~2027-13-40T00:00Z~14',
        's=apollo-11~2027-01-10T00:00Z~0',
        's=apollo-11~2027-01-10T00:00Z~91',
        's=c:-91,0~2027-01-10T00:00Z~14',
        's=c:0,181~2027-01-10T00:00Z~14',
        's=mons-mouton~2027-01-12T05:00Z~7',
      ].join('&'),
    )
    expect(state.scenarios.map((s) => s.site)).toEqual([
      { kind: 'catalog', id: 'malapert-a' },
      { kind: 'catalog', id: 'mons-mouton' },
    ])
    expect(state.scenarios[1]?.landing).toBe('2027-01-12T05:00:00Z')
  })

  it('keeps at most four scenarios', () => {
    const query = Array.from({ length: 6 }, () => 's=apollo-11~2027-01-10T00:00Z~14').join('&')
    expect(decodeState(query).scenarios).toHaveLength(4)
  })

  it('ignores out-of-range or non-numeric selection, delay and cursor', () => {
    const base = 's=apollo-11~2027-01-10T00:00Z~14'
    expect(decodeState(`${base}&sel=5`).selected).toBe(0)
    expect(decodeState(`${base}&sel=-1`).selected).toBe(0)
    expect(decodeState(`${base}&delay=-3`).delayDays).toBe(0)
    expect(decodeState(`${base}&delay=999`).delayDays).toBe(0)
    expect(decodeState(`${base}&delay=abc`).delayDays).toBe(0)
    expect(decodeState(`${base}&cursor=1.5`).cursorHours).toBe(0)
    expect(decodeState(`${base}&cursor=99999`).cursorHours).toBe(0)
  })

  it('normalises the landing time to an ISO string with an explicit Z', () => {
    for (const landing of ['2027-01-10T00:00Z', '2027-01-10T00:00:00Z', '2027-01-10T00:00']) {
      const state = decodeState(`s=apollo-11~${landing}~14`)
      expect(state.scenarios[0]?.landing).toBe('2027-01-10T00:00:00Z')
    }
  })

  it('rejects landing dates outside the supported years', () => {
    expect(decodeState('s=apollo-11~1999-01-10T00:00Z~14').scenarios).toEqual(defaultState().scenarios)
  })
})

describe('site parser', () => {
  it('parses catalog ids and custom coordinates', () => {
    expect(parseSite('malapert-a')).toEqual({ kind: 'catalog', id: 'malapert-a' })
    expect(parseSite('c:-89.9,0')).toEqual({ kind: 'custom', lat: -89.9, lon: 0 })
    expect(parseSite('c:90,-180')).toEqual({ kind: 'custom', lat: 90, lon: -180 })
  })

  it('rejects malformed values', () => {
    for (const raw of ['', 'c:', 'c:1', 'c:1,2,3', 'c:a,b', '../etc', 'UPPER', 'c:90.0001,0']) {
      expect(parseSite(raw)).toBeNull()
    }
  })
})

describe('hostile query strings', () => {
  const landing = '2027-01-10T00:00Z'
  const base = `s=malapert-a~${landing}~14`

  it.each(['__proto__', 'toString', 'hasOwnProperty', '', 'a'.repeat(65), 'UPPER', 'a_b', '-'.repeat(65)])(
    'drops the catalog id %j',
    (id) => {
      const state = decodeState(`s=${id}~${landing}~14`)
      expect(state.scenarios).toEqual(defaultState().scenarios)
    },
  )

  it('accepts ids that match the catalog format, including names that exist on Object.prototype', () => {
    expect(decodeState(`s=constructor~${landing}~14`).scenarios[0]?.site).toEqual({ kind: 'catalog', id: 'constructor' })
    expect(decodeState(`s=${'a'.repeat(64)}~${landing}~14`).scenarios[0]?.site).toEqual({
      kind: 'catalog',
      id: 'a'.repeat(64),
    })
  })

  it.each(['__proto__', 'constructor', 'toString', 'prototype', 'valueOf'])(
    'does not throw or pollute prototypes for a parameter named %s',
    (name) => {
      const state = decodeState(`${name}=1&${name}=x&${base}&${name}[a]=2`)
      expect(state.scenarios).toHaveLength(1)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(Object.getPrototypeOf({})).toBe(Object.prototype)
    },
  )

  it('ignores non-numeric and out-of-range custom coordinates', () => {
    for (const site of ['c:NaN,0', 'c:Infinity,0', 'c:1e9,0', 'c:,', 'c:-90.0001,0', 'c:0,-180.5']) {
      expect(decodeState(`s=${site}~${landing}~14`).scenarios).toEqual(defaultState().scenarios)
    }
  })
})
