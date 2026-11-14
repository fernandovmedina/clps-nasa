export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  return `${minutes} min`
}

export type CountdownResult =
  | { kind: 'event'; event: 'set' | 'rise'; remainingMs: number }
  | { kind: 'no-set' }
  | { kind: 'no-rise' }
  | { kind: 'never' }

export function countdown(input: {
  visibleNow: boolean
  nextSet: string | null
  nextRise: string | null
  nowMs: number
  neverVisible: boolean
}): CountdownResult {
  const { visibleNow, nextSet, nextRise, nowMs, neverVisible } = input
  if (visibleNow) {
    if (nextSet === null) return { kind: 'no-set' }
    return { kind: 'event', event: 'set', remainingMs: Date.parse(nextSet) - nowMs }
  }
  if (nextRise === null) return neverVisible ? { kind: 'never' } : { kind: 'no-rise' }
  return { kind: 'event', event: 'rise', remainingMs: Date.parse(nextRise) - nowMs }
}
