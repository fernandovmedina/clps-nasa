import { describe, expect, it } from 'vitest'
import { countdown, formatDuration } from './countdown'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatDuration', () => {
  it('shows days and hours from one day up', () => {
    expect(formatDuration(5 * DAY + 6 * HOUR)).toBe('5 d 6 h')
    expect(formatDuration(5 * DAY)).toBe('5 d')
    expect(formatDuration(DAY + 30 * MIN)).toBe('1 d')
  })

  it('shows hours and minutes under a day', () => {
    expect(formatDuration(6 * HOUR + 20 * MIN)).toBe('6 h 20 min')
    expect(formatDuration(6 * HOUR)).toBe('6 h')
  })

  it('shows minutes under an hour and clamps at zero', () => {
    expect(formatDuration(45 * MIN)).toBe('45 min')
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(-5 * MIN)).toBe('0 min')
    expect(formatDuration(29_000)).toBe('0 min')
  })

  it('rounds to the nearest minute', () => {
    expect(formatDuration(59 * MIN + 31_000)).toBe('1 h')
  })
})

describe('countdown', () => {
  const nowMs = Date.parse('2027-01-10T00:00:00Z')

  it('counts down to the next set while the body is visible', () => {
    const result = countdown({
      visibleNow: true,
      nextSet: '2027-01-15T06:00:00Z',
      nextRise: null,
      nowMs,
      neverVisible: false,
    })
    expect(result).toEqual({ kind: 'event', event: 'set', remainingMs: 5 * DAY + 6 * HOUR })
  })

  it('counts down to the next rise while the body is hidden', () => {
    const result = countdown({
      visibleNow: false,
      nextSet: null,
      nextRise: '2027-01-12T12:00:00Z',
      nowMs,
      neverVisible: false,
    })
    expect(result).toEqual({ kind: 'event', event: 'rise', remainingMs: 2 * DAY + 12 * HOUR })
  })

  it('reports no set in the series when a visible body never sets', () => {
    expect(countdown({ visibleNow: true, nextSet: null, nextRise: null, nowMs, neverVisible: false })).toEqual({
      kind: 'no-set',
    })
  })

  it('distinguishes never visible from not rising again', () => {
    const base = { visibleNow: false, nextSet: null, nextRise: null, nowMs }
    expect(countdown({ ...base, neverVisible: true })).toEqual({ kind: 'never' })
    expect(countdown({ ...base, neverVisible: false })).toEqual({ kind: 'no-rise' })
  })
})
