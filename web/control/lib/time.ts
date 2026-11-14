export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

const MIN_YEAR = 2000
const MAX_YEAR = 2100

export function parseUtc(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z?$/.exec(value)
  if (!match) return null
  const canonical = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}Z`
  const ms = Date.parse(canonical)
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== canonical.slice(0, 19)) return null
  const year = new Date(ms).getUTCFullYear()
  return year >= MIN_YEAR && year <= MAX_YEAR ? ms : null
}

export function isoFromMs(ms: number): string {
  return new Date(Math.round(ms / 60_000) * 60_000).toISOString().replace('.000Z', 'Z')
}

export function toInputValue(iso: string): string {
  return iso.slice(0, 16)
}

export function fromInputValue(value: string): string | null {
  const ms = parseUtc(value)
  return ms === null ? null : isoFromMs(ms)
}

export function shiftIso(iso: string, days: number): string {
  const ms = Date.parse(iso)
  return isoFromMs(ms + days * DAY_MS)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatUtc(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

export function formatUtcDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function formatDayMonth(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(ms)
}

export function formatMonthYear(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms)
}

export function formatMonth(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(ms)
}
