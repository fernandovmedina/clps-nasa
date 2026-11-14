import { horizonAt } from './horizon'
import { positionAt, seriesEndMs } from './track'
import { HOUR_MS, MINUTE_MS, formatIso, publishedAzimuth, round } from './time'
import type { EphemerisSample, HorizonFile, Interval, Track } from './types'

export type Body = 'sun' | 'earth'
export type Span = [number, number]

export interface EvalPoint {
  t: number
  az: number
  el: number
  margin: number
}

export interface Crossing {
  t: number
  rising: boolean
}

function checkRange(track: Track, fromMs: number, toMs: number): void {
  if (!(fromMs <= toMs)) throw new RangeError('interval start is after its end')
  if (!(fromMs >= track.startMs) || !(toMs <= seriesEndMs(track))) {
    throw new RangeError('interval is outside the ephemeris range')
  }
}

export function evaluationPoints(
  track: Track,
  horizon: HorizonFile,
  body: Body,
  fromMs: number,
  toMs: number,
): EvalPoint[] {
  checkRange(track, fromMs, toMs)
  const azs = body === 'sun' ? track.sunAz : track.earthAz
  const els = body === 'sun' ? track.sunEl : track.earthEl
  const point = (t: number, az: number, el: number): EvalPoint => ({
    t,
    az,
    el,
    margin: el - horizonAt(horizon, az),
  })
  const at = (t: number): EvalPoint => {
    const p = positionAt(track, t)![body]
    return point(t, p.az, p.el)
  }

  const points: EvalPoint[] = [at(fromMs)]
  const first = Math.floor((fromMs - track.startMs) / track.stepMs) + 1
  const last = Math.ceil((toMs - track.startMs) / track.stepMs) - 1
  for (let i = first; i <= last; i++) {
    points.push(point(track.startMs + i * track.stepMs, azs[i]!, els[i]!))
  }
  if (toMs > fromMs) points.push(at(toMs))
  return points
}

export function crossingsOf(points: EvalPoint[]): Crossing[] {
  const out: Crossing[] = []
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1]!
    const q = points[k]!
    const pVisible = p.margin > 0
    const qVisible = q.margin > 0
    if (pVisible !== qVisible) {
      // zero of the margin interpolated linearly between the two points
      out.push({ t: p.t + ((q.t - p.t) * p.margin) / (p.margin - q.margin), rising: qVisible })
    }
  }
  return out.filter((c, k) => {
    const next = out[k + 1]
    const prev = out[k - 1]
    if (!c.rising && next?.rising && next.t - c.t < 1) return false
    if (c.rising && prev && !prev.rising && c.t - prev.t < 1) return false
    return true
  })
}

export function spansOf(points: EvalPoint[], crossings: Crossing[]): Span[] {
  const spans: Span[] = []
  let open: number | null = points[0]!.margin > 0 ? points[0]!.t : null
  for (const c of crossings) {
    if (c.rising) {
      open = c.t
    } else if (open !== null) {
      spans.push([open, c.t])
      open = null
    }
  }
  if (open !== null) spans.push([open, points[points.length - 1]!.t])
  return spans.filter(([a, b]) => b > a)
}

export function intersectSpans(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const [a0, a1] = a[i]!
    const [b0, b1] = b[j]!
    const lo = Math.max(a0, b0)
    const hi = Math.min(a1, b1)
    if (hi > lo) out.push([lo, hi])
    if (a1 < b1) i++
    else j++
  }
  return out
}

export function totalHours(spans: Span[]): number {
  return spans.reduce((sum, [a, b]) => sum + (b - a), 0) / HOUR_MS
}

export function toIntervals(spans: Span[]): Interval[] {
  const rounded: Span[] = []
  for (const [a, b] of spans) {
    const from = Math.round(a / MINUTE_MS) * MINUTE_MS
    const to = Math.round(b / MINUTE_MS) * MINUTE_MS
    if (to <= from) continue
    const last = rounded[rounded.length - 1]
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else rounded.push([from, to])
  }
  return rounded.map(([a, b]) => [formatIso(a), formatIso(b)])
}

export function bodySpans(
  track: Track,
  horizon: HorizonFile,
  fromMs: number,
  toMs: number,
): { sun: Span[]; earth: Span[]; both: Span[] } {
  const sunPoints = evaluationPoints(track, horizon, 'sun', fromMs, toMs)
  const earthPoints = evaluationPoints(track, horizon, 'earth', fromMs, toMs)
  const sun = spansOf(sunPoints, crossingsOf(sunPoints))
  const earth = spansOf(earthPoints, crossingsOf(earthPoints))
  return { sun, earth, both: intersectSpans(sun, earth) }
}

export function visibilityWindows(
  track: Track,
  horizon: HorizonFile,
  startMs: number,
  endMs: number,
): { sun: Interval[]; earth: Interval[]; both: Interval[] } {
  const s = bodySpans(track, horizon, startMs, endMs)
  return { sun: toIntervals(s.sun), earth: toIntervals(s.earth), both: toIntervals(s.both) }
}

export function sampleRange(
  track: Track,
  horizon: HorizonFile,
  startMs: number,
  endMs: number,
  stepMinutes?: number,
): EphemerisSample[] {
  const stepMs = stepMinutes === undefined ? track.stepMs : stepMinutes * 60_000
  if (!(stepMs > 0) || !Number.isFinite(stepMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new RangeError('invalid sampling range or step')
  }
  const hi = Math.min(endMs, seriesEndMs(track))
  const k0 = Math.max(0, Math.ceil((track.startMs - startMs) / stepMs))
  const out: EphemerisSample[] = []
  for (let k = k0; startMs + k * stepMs <= hi; k++) {
    const t = startMs + k * stepMs
    const p = positionAt(track, t)
    if (p === null) continue
    const body = (b: { az: number; el: number }) => ({
      az: publishedAzimuth(b.az),
      el: round(b.el, 2),
      visible: b.el - horizonAt(horizon, b.az) > 0,
    })
    out.push({ t: formatIso(t), sun: body(p.sun), earth: body(p.earth) })
  }
  return out
}
