export type SiteRef = { kind: 'catalog'; id: string } | { kind: 'custom'; lat: number; lon: number }

export interface Scenario {
  site: SiteRef
  landing: string
  durationDays: number
}

export interface AppState {
  scenarios: Scenario[]
  selected: number
  delayDays: number
  cursorHours: number
}

export const MAX_SCENARIOS = 4
export const MIN_DURATION_DAYS = 1
export const MAX_DURATION_DAYS = 90
export const MAX_DELAY_DAYS = 90
export const MAX_CURSOR_HOURS = MAX_DURATION_DAYS * 24
export const DELAY_STEPS = [-7, 7, 14, 21, 30] as const
export const INITIAL_LANDING = '2027-01-10T00:00:00Z'
export const INITIAL_DURATION_DAYS = 14

export const SCENARIO_LETTERS = ['A', 'B', 'C', 'D'] as const

export function defaultState(): AppState {
  return {
    scenarios: [
      { site: { kind: 'catalog', id: 'malapert-a' }, landing: INITIAL_LANDING, durationDays: INITIAL_DURATION_DAYS },
      { site: { kind: 'catalog', id: 'mons-mouton' }, landing: INITIAL_LANDING, durationDays: INITIAL_DURATION_DAYS },
    ],
    selected: 0,
    delayDays: 0,
    cursorHours: 0,
  }
}

export function siteKey(site: SiteRef): string {
  return site.kind === 'catalog' ? site.id : `c:${site.lat},${site.lon}`
}
