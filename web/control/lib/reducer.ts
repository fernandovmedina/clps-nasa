import {
  MAX_CURSOR_HOURS,
  MAX_DELAY_DAYS,
  MAX_DURATION_DAYS,
  MAX_SCENARIOS,
  MIN_DURATION_DAYS,
  type AppState,
  type SiteRef,
} from './types'

export type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'select'; index: number }
  | { type: 'setSite'; index: number; site: SiteRef }
  | { type: 'setLanding'; index: number; landing: string }
  | { type: 'setDuration'; index: number; days: number }
  | { type: 'add'; site: SiteRef }
  | { type: 'duplicate'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'addDelay'; days: number }
  | { type: 'setDelay'; days: number }
  | { type: 'setCursor'; hours: number }
  | { type: 'advance'; max: number }

const PLAY_STEP_HOURS = 2

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'select':
      return action.index >= 0 && action.index < state.scenarios.length ? { ...state, selected: action.index } : state
    case 'setSite':
      return patch(state, action.index, { site: action.site })
    case 'setLanding':
      return patch(state, action.index, { landing: action.landing })
    case 'setDuration':
      return patch(state, action.index, {
        durationDays: clamp(Math.round(action.days), MIN_DURATION_DAYS, MAX_DURATION_DAYS),
      })
    case 'add': {
      if (state.scenarios.length >= MAX_SCENARIOS) return state
      const base = state.scenarios[state.selected] ?? state.scenarios[0]
      if (!base) return state
      const scenarios = [...state.scenarios, { ...base, site: action.site }]
      return { ...state, scenarios, selected: scenarios.length - 1 }
    }
    case 'duplicate': {
      const source = state.scenarios[action.index]
      if (!source || state.scenarios.length >= MAX_SCENARIOS) return state
      const scenarios = [...state.scenarios]
      scenarios.splice(action.index + 1, 0, { ...source })
      return { ...state, scenarios, selected: action.index + 1 }
    }
    case 'remove': {
      if (state.scenarios.length <= 1 || !state.scenarios[action.index]) return state
      const scenarios = state.scenarios.filter((_, i) => i !== action.index)
      const selected =
        state.selected > action.index ? state.selected - 1 : Math.min(state.selected, scenarios.length - 1)
      return { ...state, scenarios, selected }
    }
    case 'addDelay':
      return { ...state, delayDays: clamp(state.delayDays + action.days, 0, MAX_DELAY_DAYS) }
    case 'setDelay':
      return { ...state, delayDays: clamp(Math.round(action.days), 0, MAX_DELAY_DAYS) }
    case 'setCursor':
      return { ...state, cursorHours: clamp(Math.round(action.hours), 0, MAX_CURSOR_HOURS) }
    case 'advance':
      return { ...state, cursorHours: clamp(state.cursorHours + PLAY_STEP_HOURS, 0, Math.min(action.max, MAX_CURSOR_HOURS)) }
  }
}

function patch(state: AppState, index: number, change: Partial<AppState['scenarios'][number]>): AppState {
  if (!state.scenarios[index]) return state
  return { ...state, scenarios: state.scenarios.map((s, i) => (i === index ? { ...s, ...change } : s)) }
}
