import { describe, expect, it } from 'vitest'
import { formatUtc, fromInputValue, isoFromMs, parseUtc, shiftIso, toInputValue } from './time'

describe('UTC helpers', () => {
  it('turns a date-time field value into ISO 8601 with an explicit Z', () => {
    expect(fromInputValue('2027-01-10T00:00')).toBe('2027-01-10T00:00:00Z')
    expect(fromInputValue('2027-01-10T13:45')).toBe('2027-01-10T13:45:00Z')
  })

  it('returns null for empty or impossible values', () => {
    expect(fromInputValue('')).toBeNull()
    expect(fromInputValue('2027-02-30T00:00')).toBeNull()
    expect(fromInputValue('2027-01-10')).toBeNull()
    expect(fromInputValue('1990-01-10T00:00')).toBeNull()
  })

  it('round-trips through the field value', () => {
    expect(toInputValue('2027-01-10T06:30:00Z')).toBe('2027-01-10T06:30')
    expect(fromInputValue(toInputValue('2027-01-10T06:30:00Z'))).toBe('2027-01-10T06:30:00Z')
  })

  it('shifts by whole days without touching the time of day', () => {
    expect(shiftIso('2027-01-10T06:30:00Z', 21)).toBe('2027-01-31T06:30:00Z')
    expect(shiftIso('2027-01-31T00:00:00Z', 30)).toBe('2027-03-02T00:00:00Z')
  })

  it('formats unambiguous UTC strings', () => {
    expect(formatUtc(Date.parse('2027-01-10T00:00:00Z'))).toBe('2027-01-10 00:00 UTC')
    expect(isoFromMs(Date.parse('2027-01-10T00:00:29Z'))).toBe('2027-01-10T00:00:00Z')
    expect(parseUtc('2027-01-10T00:00Z')).toBe(Date.parse('2027-01-10T00:00:00Z'))
  })
})
