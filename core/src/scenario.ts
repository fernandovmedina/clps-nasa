import {
  crossingsOf,
  evaluationPoints,
  intersectSpans,
  spansOf,
  toIntervals,
  totalHours,
  type Body,
  type EvalPoint,
  type Span,
} from './visibility'
import { seriesEndMs } from './track'
import { DAY_MS, HOUR_MS, formatIso, isIsoDate, publishedAzimuth, round } from './time'
import type {
  BodySummary,
  HorizonFile,
  ScenarioResponse,
  ScenarioStatus,
  Site,
  Track,
} from './types'

/** Apparent angular radius of the Sun seen from the Moon (deg). */
export const SUN_RADIUS_DEG = 0.2666

/**
 * Score weights (sum = 1). Documented in CLAUDE.md sec. 7.
 *  - energy:     mean fraction of the solar disk above the local horizon (power)
 *  - comms:      fraction of the mission with the Earth above the local horizon (DTE link)
 *  - ops:        fraction with Sun AND Earth at the same time (powered + talking to Earth)
 *  - continuity: 1 - longest continuous time without Sun / mission length (survive the night)
 */
export const SCORE_WEIGHTS = { energy: 0.3, comms: 0.25, ops: 0.3, continuity: 0.15 } as const

/**
 * Fraction (0..1) of a disk of angular radius `radiusDeg` that is above a locally
 * flat horizon when its centre is `marginDeg` above it (circular-segment area).
 */
export function visibleDiskFraction(marginDeg: number, radiusDeg: number): number {
  if (marginDeg >= radiusDeg) return 1
  if (marginDeg <= -radiusDeg) return 0
  const h = marginDeg / radiusDeg
  const below = (Math.acos(h) - h * Math.sqrt(1 - h * h)) / Math.PI
  return 1 - below
}

/** Time-weighted mean of the visible solar-disk fraction over the evaluated points. */
function meanSunDisk(points: EvalPoint[]): number {
  if (points.length < 2) return points.length ? visibleDiskFraction(points[0]!.margin, SUN_RADIUS_DEG) : 0
  let area = 0
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1]!
    const q = points[k]!
    const fp = visibleDiskFraction(p.margin, SUN_RADIUS_DEG)
    const fq = visibleDiskFraction(q.margin, SUN_RADIUS_DEG)
    area += ((fp + fq) / 2) * (q.t - p.t)
  }
  const span = points[points.length - 1]!.t - points[0]!.t
  return span > 0 ? area / span : 0
}

/** Longest stretch (ms) inside [from, to] not covered by any span. */
function longestGapMs(spans: Span[], from: number, to: number): number {
  let cursor = from
  let longest = 0
  for (const [a, b] of spans) {
    if (a > cursor) longest = Math.max(longest, Math.min(a, to) - cursor)
    cursor = Math.max(cursor, b)
  }
  if (to > cursor) longest = Math.max(longest, to - cursor)
  return longest
}

function summarize(
  track: Track,
  horizon: HorizonFile,
  body: Body,
  landingMs: number,
  missionEndMs: number,
  seriesEnd: number,
) {
  const points = evaluationPoints(track, horizon, body, landingMs, missionEndMs)
  const spans = spansOf(points, crossingsOf(points))

  const ahead: EvalPoint[] =
    missionEndMs === seriesEnd ? points : evaluationPoints(track, horizon, body, landingMs, seriesEnd)
  const later = crossingsOf(ahead).filter((c) => c.t > landingMs)
  const nextSet = later.find((c) => !c.rising)
  const nextRise = later.find((c) => c.rising)

  const els = points.map((p) => p.el)
  const now = points[0]!
  const summary: BodySummary = {
    az_now: publishedAzimuth(now.az),
    elev_now: round(now.el, 2),
    visible_now: now.margin > 0,
    hours_visible: round(totalHours(spans), 1),
    max_elev: round(els.reduce((a, b) => (b > a ? b : a), -Infinity), 2),
    min_elev: round(els.reduce((a, b) => (b < a ? b : a), Infinity), 2),
    avg_elev: round(els.reduce((a, b) => a + b, 0) / els.length, 2),
    next_set: nextSet ? formatIso(nextSet.t) : null,
    next_rise: nextRise ? formatIso(nextRise.t) : null,
  }
  return { summary, spans, points }
}

function classify(score: number, energy: number, earth: number, both: number): ScenarioStatus {
  if (score < 40 || energy < 0.1 || earth < 0.1) return 'not_viable'
  if (score >= 70 && both >= 0.5) return 'viable'
  return 'marginal'
}

const STATUS_TIER: Record<ScenarioStatus, number> = { viable: 0, marginal: 1, not_viable: 2 }

/**
 * Ranking order: status tier first (a not-viable site never outranks a marginal one),
 * then score, then time with Sun and Earth together, then energy.
 */
export function compareScenarios(a: ScenarioResponse, b: ScenarioResponse): number {
  return (
    STATUS_TIER[a.status] - STATUS_TIER[b.status] ||
    b.score - a.score ||
    b.metrics.ops - a.metrics.ops ||
    b.metrics.energy - a.metrics.energy
  )
}

export function computeScenario(input: {
  site: Pick<Site, 'id' | 'name' | 'horizon_source' | 'ephemeris_source'>
  track: Track
  horizon: HorizonFile
  landing: string
  durationDays: number
}): ScenarioResponse {
  const { site, track, horizon, landing, durationDays } = input
  const landingMs = isIsoDate(landing) ? Date.parse(landing) : Number.NaN
  if (!Number.isFinite(landingMs)) throw new RangeError(`invalid landing: ${landing}`)
  if (!(durationDays > 0) || !Number.isFinite(durationDays)) {
    throw new RangeError(`invalid durationDays: ${durationDays}`)
  }
  const seriesEnd = seriesEndMs(track)
  if (landingMs < track.startMs || landingMs > seriesEnd) {
    throw new RangeError('landing is outside the ephemeris range')
  }

  const requestedEnd = landingMs + durationDays * DAY_MS
  const truncated = requestedEnd > seriesEnd
  const missionEndMs = truncated ? seriesEnd : requestedEnd
  const missionHours = (missionEndMs - landingMs) / HOUR_MS

  const sun = summarize(track, horizon, 'sun', landingMs, missionEndMs, seriesEnd)
  const earth = summarize(track, horizon, 'earth', landingMs, missionEndMs, seriesEnd)
  const both = intersectSpans(sun.spans, earth.spans)

  const fraction = (hours: number) => (missionHours > 0 ? round(hours / missionHours, 3) : 0)
  const fractions = {
    sun: fraction(totalHours(sun.spans)),
    earth: fraction(totalHours(earth.spans)),
    both: fraction(totalHours(both)),
  }
  const longestDarkMs = missionHours > 0 ? longestGapMs(sun.spans, landingMs, missionEndMs) : 0
  const metrics = {
    energy: round(meanSunDisk(sun.points), 3),
    comms: fractions.earth,
    ops: fractions.both,
    continuity: missionHours > 0 ? round(1 - longestDarkMs / (missionEndMs - landingMs), 3) : 0,
    longest_dark_h: round(longestDarkMs / HOUR_MS, 1),
  }
  const w = SCORE_WEIGHTS
  // weighted sum in integer thousandths, rounded half up
  const thousandths =
    w.energy * Math.round(metrics.energy * 1000) +
    w.comms * Math.round(metrics.comms * 1000) +
    w.ops * Math.round(metrics.ops * 1000) +
    w.continuity * Math.round(metrics.continuity * 1000)
  const score = Math.floor((Math.round(thousandths) + 5) / 10)

  return {
    site_id: site.id,
    site_name: site.name,
    landing: formatIso(landingMs),
    duration_days: durationDays,
    horizon_source: site.horizon_source,
    ephemeris_source: site.ephemeris_source,
    truncated,
    sun: sun.summary,
    earth: earth.summary,
    windows: {
      sun: toIntervals(sun.spans),
      earth: toIntervals(earth.spans),
      both: toIntervals(both),
    },
    fractions,
    metrics,
    score,
    status: classify(score, metrics.energy, fractions.earth, fractions.both),
  }
}
