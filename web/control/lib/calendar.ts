import type { ScenarioStatus } from '@touchdown/core'
import type { SiteData } from './data'
import { DAY_MS, isoFromMs } from './time'
import { evaluate } from './scenario'

export interface DayCell {
  ms: number
  status: ScenarioStatus | null
  score: number
}

export const STATUS_HEIGHT: Record<ScenarioStatus, number> = {
  viable: 1,
  marginal: 0.66,
  not_viable: 0.33,
}

export function landingDays(startMs: number, endMs: number): number[] {
  const out: number[] = []
  for (let ms = Math.ceil(startMs / DAY_MS) * DAY_MS; ms <= endMs; ms += DAY_MS) out.push(ms)
  return out
}

export function dayIndexAt(x: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)))
}

export function dayPosition(ms: number, firstMs: number, count: number): number {
  return Math.min(count, Math.max(0, (ms - firstMs) / DAY_MS + 0.5))
}

export function monthTicks(days: number[]): { index: number; ms: number }[] {
  const ticks: { index: number; ms: number }[] = []
  days.forEach((ms, index) => {
    if (index === 0 || new Date(ms).getUTCDate() === 1) ticks.push({ index, ms })
  })
  return ticks
}

export function countStatuses(cells: DayCell[]): Record<ScenarioStatus, number> {
  const counts: Record<ScenarioStatus, number> = { viable: 0, marginal: 0, not_viable: 0 }
  for (const cell of cells) if (cell.status) counts[cell.status] += 1
  return counts
}

export function computeDay(data: SiteData, ms: number, durationDays: number): DayCell {
  const result = evaluate(data, isoFromMs(ms), durationDays)
  if (!result.ok) return { ms, status: null, score: 0 }
  return { ms, status: result.response.status, score: result.response.score }
}

const CHUNK = 14
const cache = new Map<string, Promise<DayCell[]>>()

export function computeCalendar(key: string, data: SiteData, durationDays: number): Promise<DayCell[]> {
  const cacheKey = `${key}|${durationDays}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const days = landingDays(data.track.startMs, data.seriesEndMs)
  const task = (async () => {
    const cells: DayCell[] = []
    for (let i = 0; i < days.length; i += CHUNK) {
      for (const ms of days.slice(i, i + CHUNK)) cells.push(computeDay(data, ms, durationDays))
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    return cells
  })()
  cache.set(cacheKey, task)
  task.catch(() => cache.delete(cacheKey))
  return task
}
