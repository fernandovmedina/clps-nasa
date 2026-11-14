export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

export function formatIso(ms: number): string {
  const rounded = Math.round(ms / MINUTE_MS) * MINUTE_MS
  return new Date(rounded).toISOString().replace('.000Z', 'Z')
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const result = Math.round(value * factor) / factor
  return Object.is(result, -0) ? 0 : result
}

export function wrapDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export function shortArcDelta(from: number, to: number): number {
  return wrapDegrees(to - from + 180) - 180
}

export function publishedAzimuth(az: number): number {
  return round(az, 2) % 360
}

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2})))?$/

function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = ISO_DATE.exec(v)
  if (m === null) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!) return false
  const [hour, minute, second] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)]
  if (hour > 23 || minute > 59 || second > 59) return false
  if (m[7] !== undefined && (Number(m[7]) > 23 || Number(m[8]) > 59)) return false
  return Number.isFinite(Date.parse(v))
}
