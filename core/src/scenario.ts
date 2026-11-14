import {
  crossingsOf,
  evaluationPoints,
  intersectSpans,
  spansOf,
  toIntervals,
  totalHours,
  type Body,
  type EvalPoint,
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
  return { summary, spans }
}

function classify(score: number, sun: number, earth: number, both: number): ScenarioStatus {
  if (score < 40 || sun < 0.1 || earth < 0.1) return 'not_viable'
  if (score >= 70 && both >= 0.5) return 'viable'
  return 'marginal'
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
  // 100 * (0.5 * sun + 0.5 * earth) with both fractions in integer thousandths, rounded half up
  const score = Math.floor((Math.round(fractions.sun * 1000) + Math.round(fractions.earth * 1000) + 10) / 20)

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
    score,
    status: classify(score, fractions.sun, fractions.earth, fractions.both),
  }
}
