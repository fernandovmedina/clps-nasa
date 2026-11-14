import { badRequest } from './http'

const ID = /^[a-z0-9-]{1,64}$/
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2})))?$/
const STEP = /^([1-9]\d{0,5})([mhd])$/
const STEP_MINUTES = { m: 1, h: 60, d: 1440 } as const

export function parseId(value: string, name: string): string {
  if (!ID.test(value)) throw badRequest(`${name} must match ^[a-z0-9-]{1,64}$`)
  return value
}

export function parseNumber(value: string, name: string): number {
  const parsed = NUMBER.test(value) ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) throw badRequest(`${name} must be a finite number`)
  return parsed
}

export function parseLatitude(value: string): number {
  const lat = parseNumber(value, 'lat')
  if (lat < -90 || lat > 90) throw badRequest('lat must be within [-90, 90]')
  return lat
}

export function parseLongitude(value: string): number {
  const lon = parseNumber(value, 'lon')
  if (lon < -180 || lon >= 360) throw badRequest('lon must be within [-180, 360)')
  return lon > 180 ? lon - 360 : lon
}

export function parseDurationDays(value: string): number {
  const days = parseNumber(value, 'duration_days')
  if (!(days > 0 && days <= 60)) throw badRequest('duration_days must be within (0, 60]')
  return days
}

export function parseInstant(value: string, name: string): number {
  const m = INSTANT.exec(value)
  if (m === null) throw badRequest(`${name} must be an ISO 8601 date-time with a time zone`)
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  const calendarOk =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  const [hour, minute, second] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)]
  const zoneOk = m[7] === undefined || (Number(m[7]) <= 23 && Number(m[8]) <= 59)
  const ms = Date.parse(value)
  if (!calendarOk || hour > 23 || minute > 59 || second > 59 || !zoneOk || !Number.isFinite(ms)) {
    throw badRequest(`${name} is not a valid date`)
  }
  return ms
}

export function parseStepMinutes(value: string): number {
  const m = STEP.exec(value)
  if (m === null) throw badRequest('step must look like 30m, 1h or 1d')
  return Number(m[1]) * STEP_MINUTES[m[2] as keyof typeof STEP_MINUTES]
}
