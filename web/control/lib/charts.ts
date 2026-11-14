import type { EphemerisSample } from '@touchdown/core'

export type Point = [number, number]

export interface PathRun {
  visible: boolean
  points: Point[]
}

export function wrapAzimuth(az: number): number {
  const a = ((az % 360) + 360) % 360
  return a > 180 ? a - 360 : a
}

export function splitRuns(samples: EphemerisSample[], body: 'sun' | 'earth'): PathRun[] {
  const runs: PathRun[] = []
  let current: PathRun | null = null
  let previous: Point | null = null
  for (const sample of samples) {
    const b = sample[body]
    const point: Point = [wrapAzimuth(b.az), b.el]
    const jumped = previous !== null && Math.abs(point[0] - previous[0]) > 180
    if (current === null || current.visible !== b.visible || jumped) {
      current = { visible: b.visible, points: jumped || previous === null ? [] : [previous] }
      runs.push(current)
    }
    current.points.push(point)
    previous = point
  }
  return runs
}

export function horizonCurve(horizonDeg: number[], stepDeg: number): Point[] {
  const n = horizonDeg.length
  const out: Point[] = []
  for (let j = 0; j <= n; j++) {
    out.push([-180 + j * stepDeg, horizonDeg[(j + n / 2) % n] ?? 0])
  }
  return out
}

export function niceElevationTicks(min: number, max: number): number[] {
  return [0, 5, 10, 20, 30, 60].filter((v) => v > min && v < max)
}

export function dayTickStep(days: number, widthPx: number): number {
  const perDay = widthPx / Math.max(1, days)
  for (const step of [1, 2, 5, 7, 10, 14, 30]) {
    if (perDay * step >= 32) return step
  }
  return 30
}
