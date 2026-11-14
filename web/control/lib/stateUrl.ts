import {
  MAX_CURSOR_HOURS,
  MAX_DELAY_DAYS,
  MAX_DURATION_DAYS,
  MAX_SCENARIOS,
  MIN_DURATION_DAYS,
  defaultState,
  type AppState,
  type Scenario,
  type SiteRef,
} from './types'
import { isoFromMs, parseUtc } from './time'

const CATALOG_ID = /^[a-z0-9-]{1,64}$/
const CUSTOM_SITE = /^c:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

export function parseSite(raw: string): SiteRef | null {
  if (CATALOG_ID.test(raw)) return { kind: 'catalog', id: raw }
  const m = CUSTOM_SITE.exec(raw)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null
  return { kind: 'custom', lat: round4(lat), lon: round4(lon) }
}

function parseInteger(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined || !/^-?\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= min && n <= max ? n : null
}

function parseScenario(raw: string): Scenario | null {
  const [site, landing, days, ...rest] = raw.split('~')
  if (rest.length > 0 || site === undefined || landing === undefined || days === undefined) return null
  const ref = parseSite(site)
  const ms = parseUtc(landing)
  const duration = parseInteger(days, MIN_DURATION_DAYS, MAX_DURATION_DAYS)
  if (ref === null || ms === null || duration === null) return null
  return { site: ref, landing: isoFromMs(ms), durationDays: duration }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return ''
  }
}

export function decodeState(search: string): AppState {
  const params = new Map<string, string[]>()
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (part === '') continue
    const eq = part.indexOf('=')
    const key = safeDecode(eq === -1 ? part : part.slice(0, eq))
    const value = safeDecode(eq === -1 ? '' : part.slice(eq + 1))
    const list = params.get(key)
    if (list) list.push(value)
    else params.set(key, [value])
  }
  const first = (key: string) => params.get(key)?.[0]

  const parsed = (params.get('s') ?? [])
    .map(parseScenario)
    .filter((s): s is Scenario => s !== null)
    .slice(0, MAX_SCENARIOS)
  const scenarios = parsed.length > 0 ? parsed : defaultState().scenarios

  return {
    scenarios,
    selected: parseInteger(first('sel'), 0, scenarios.length - 1) ?? 0,
    delayDays: parseInteger(first('delay'), 0, MAX_DELAY_DAYS) ?? 0,
    cursorHours: parseInteger(first('cursor'), 0, MAX_CURSOR_HOURS) ?? 0,
  }
}

function encodeSite(site: SiteRef): string {
  return site.kind === 'catalog' ? site.id : `c:${round4(site.lat)},${round4(site.lon)}`
}

export function encodeState(state: AppState): string {
  const parts = state.scenarios.map((s) => {
    const landing = s.landing.replace(/:00Z$/, 'Z')
    return `s=${encodeSite(s.site)}~${landing}~${s.durationDays}`
  })
  if (state.selected !== 0) parts.push(`sel=${state.selected}`)
  if (state.delayDays !== 0) parts.push(`delay=${state.delayDays}`)
  if (state.cursorHours !== 0) parts.push(`cursor=${Math.round(state.cursorHours)}`)
  return parts.join('&')
}
