import { computeScenario, positionAt, horizonAt, type ScenarioResponse } from '@touchdown/core'
import type { SiteData } from './data'
import { HOUR_MS, DAY_MS, isoFromMs } from './time'

export type Evaluation =
  | {
      ok: true
      response: ScenarioResponse
      landingMs: number
      missionHours: number
    }
  | { ok: false; reason: 'range'; startMs: number; endMs: number }
  | { ok: false; reason: 'invalid' }

export function evaluate(data: SiteData, landing: string, durationDays: number): Evaluation {
  const landingMs = Date.parse(landing)
  if (!Number.isFinite(landingMs)) return { ok: false, reason: 'invalid' }
  if (landingMs < data.track.startMs || landingMs > data.seriesEndMs) {
    return { ok: false, reason: 'range', startMs: data.track.startMs, endMs: data.seriesEndMs }
  }
  const response = computeScenario({
    site: {
      id: data.info.id,
      name: data.info.name ?? data.info.id,
      horizon_source: data.info.horizonSource,
      ephemeris_source: data.info.ephemerisSource,
    },
    track: data.track,
    horizon: data.horizon,
    landing: isoFromMs(landingMs),
    durationDays,
  })
  const endMs = Math.min(landingMs + durationDays * DAY_MS, data.seriesEndMs)
  return { ok: true, response, landingMs, missionHours: (endMs - landingMs) / HOUR_MS }
}

export interface BodyAt {
  az: number
  el: number
  horizonEl: number
  visible: boolean
}

export interface Masked {
  el: number
  horizonEl: number
  gap: number
}

/** Cuerpo con elevación positiva que el relieve LOLA tapa en su azimut: elevación, horizonte y lo que falta. */
export function maskedBy(body: BodyAt): Masked | null {
  if (body.visible || body.el <= 0) return null
  return { el: body.el, horizonEl: body.horizonEl, gap: Math.round((body.horizonEl - body.el) * 1e6) / 1e6 }
}

export function bodiesAt(data: SiteData, ms: number): { sun: BodyAt; earth: BodyAt } | null {
  const p = positionAt(data.track, ms)
  if (p === null) return null
  const at = (b: { az: number; el: number }): BodyAt => {
    const horizonEl = horizonAt(data.horizon, b.az)
    return { az: b.az, el: b.el, horizonEl, visible: b.el - horizonEl > 0 }
  }
  return { sun: at(p.sun), earth: at(p.earth) }
}

export function cursorCountdown(data: SiteData, cursorMs: number) {
  return computeScenario({
    site: {
      id: data.info.id,
      name: data.info.name ?? data.info.id,
      horizon_source: data.info.horizonSource,
      ephemeris_source: data.info.ephemerisSource,
    },
    track: data.track,
    horizon: data.horizon,
    landing: isoFromMs(cursorMs),
    durationDays: 1,
  })
}
