import { describe, expect, it } from 'vitest'
import { launchHref, shortSiteName } from './launch'
import { shiftIso } from './time'

const landing = '2027-01-10T00:00:00Z'

describe('launchHref', () => {
  it('links a catalog site at its landing date', () => {
    expect(launchHref({ kind: 'catalog', id: 'malapert-a' }, Date.parse(landing))).toBe(
      '/?landing=2027-01-10T00:00:00Z&site=malapert-a',
    )
  })

  it('uses the effective landing once the mission delay is applied', () => {
    const delayed = Date.parse(shiftIso(landing, 21))
    expect(launchHref({ kind: 'catalog', id: 'mons-mouton' }, delayed)).toBe(
      '/?landing=2027-01-31T00:00:00Z&site=mons-mouton',
    )
  })

  it('leaves the site out for custom coordinates', () => {
    expect(launchHref({ kind: 'custom', lat: -89.9, lon: 0 }, Date.parse(landing))).toBe('/?landing=2027-01-10T00:00:00Z')
  })

  it('keeps minutes and rounds to whole minutes', () => {
    expect(launchHref({ kind: 'catalog', id: 'apollo-11' }, Date.parse('2027-03-05T13:45:00Z'))).toBe(
      '/?landing=2027-03-05T13:45:00Z&site=apollo-11',
    )
    expect(launchHref({ kind: 'catalog', id: 'apollo-11' }, Date.parse('2027-03-05T13:45:31Z'))).toBe(
      '/?landing=2027-03-05T13:46:00Z&site=apollo-11',
    )
  })

  it('escapes site ids and refuses a date that is not finite', () => {
    expect(launchHref({ kind: 'catalog', id: 'a b&c' }, Date.parse(landing))).toBe(
      '/?landing=2027-01-10T00:00:00Z&site=a%20b%26c',
    )
    expect(launchHref({ kind: 'catalog', id: 'malapert-a' }, Number.NaN)).toBeNull()
  })
})

describe('shortSiteName', () => {
  it('drops the parenthetical mission', () => {
    expect(shortSiteName('Mons Mouton (IM-2 Athena)')).toBe('Mons Mouton')
    expect(shortSiteName('Malapert A (IM-1 Odysseus)')).toBe('Malapert A')
  })

  it('keeps a short name as it is', () => {
    expect(shortSiteName('Nobile Rim 2')).toBe('Nobile Rim 2')
  })

  it('cuts a long name at a word and adds an ellipsis', () => {
    const short = shortSiteName('Shackleton Connecting Ridge')
    expect(short).toBe('Shackleton Connecting…')
    expect(short.length).toBeLessThanOrEqual(24)
  })

  it('cuts a long single word hard', () => {
    expect(shortSiteName('A'.repeat(40))).toBe(`${'A'.repeat(23)}…`)
  })
})
