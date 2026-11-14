import { describe, expect, it } from 'vitest'
import { reducer } from './reducer'
import { MAX_DELAY_DAYS, defaultState, type AppState } from './types'

const site = { kind: 'catalog', id: 'apollo-11' } as const

function filled(count: number): AppState {
  let state = defaultState()
  while (state.scenarios.length < count) state = reducer(state, { type: 'add', site })
  return state
}

describe('scenario list', () => {
  it('adds scenarios up to four and selects the new one', () => {
    const state = filled(4)
    expect(state.scenarios).toHaveLength(4)
    expect(state.selected).toBe(3)
    expect(reducer(state, { type: 'add', site })).toBe(state)
  })

  it('duplicates after the source and refuses beyond four', () => {
    const state = reducer(defaultState(), { type: 'duplicate', index: 0 })
    expect(state.scenarios).toHaveLength(3)
    expect(state.scenarios[1]).toEqual(state.scenarios[0])
    expect(state.selected).toBe(1)
    const full = filled(4)
    expect(reducer(full, { type: 'duplicate', index: 0 })).toBe(full)
  })

  it('removes a scenario, keeps at least one and fixes the selection', () => {
    const state = reducer({ ...filled(3), selected: 2 }, { type: 'remove', index: 0 })
    expect(state.scenarios).toHaveLength(2)
    expect(state.selected).toBe(1)
    const single = reducer(reducer(defaultState(), { type: 'remove', index: 0 }), { type: 'remove', index: 0 })
    expect(single.scenarios).toHaveLength(1)
  })
})

describe('delay and cursor', () => {
  it('accumulates delay steps within the allowed range', () => {
    let state = reducer(defaultState(), { type: 'addDelay', days: 21 })
    expect(state.delayDays).toBe(21)
    state = reducer(state, { type: 'addDelay', days: -7 })
    expect(state.delayDays).toBe(14)
    state = reducer(state, { type: 'addDelay', days: -30 })
    expect(state.delayDays).toBe(0)
    state = reducer(state, { type: 'addDelay', days: 500 })
    expect(state.delayDays).toBe(MAX_DELAY_DAYS)
  })

  it('advances the cursor up to the mission length', () => {
    let state = defaultState()
    for (let i = 0; i < 400; i++) state = reducer(state, { type: 'advance', max: 336 })
    expect(state.cursorHours).toBe(336)
  })

  it('clamps landing durations to the supported range', () => {
    expect(reducer(defaultState(), { type: 'setDuration', index: 0, days: 0 }).scenarios[0]?.durationDays).toBe(1)
    expect(reducer(defaultState(), { type: 'setDuration', index: 0, days: 400 }).scenarios[0]?.durationDays).toBe(90)
  })
})
