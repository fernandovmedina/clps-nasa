'use client'

import { useMemo } from 'react'
import { sampleRange } from '@touchdown/core'
import { loadSiteData, type SiteData } from './data'
import { bodiesAt, cursorCountdown, evaluate, type Evaluation } from './scenario'
import { HOUR_MS, shiftIso } from './time'
import { siteKey, type Scenario } from './types'
import { useAsync, type AsyncState } from './useAsync'

export function useCardModel(scenario: Scenario, delayDays: number, cursorHours: number) {
  const [load, retry] = useAsync<SiteData>(siteKey(scenario.site), () => loadSiteData(scenario.site))
  const data = load.status === 'ready' ? load.value : null
  const { landing, durationDays } = scenario

  const original = useMemo<Evaluation | null>(
    () => (data ? evaluate(data, landing, durationDays) : null),
    [data, landing, durationDays],
  )
  const shifted = useMemo<Evaluation | null>(
    () => (data ? (delayDays === 0 ? original : evaluate(data, shiftIso(landing, delayDays), durationDays)) : null),
    [data, original, landing, delayDays, durationDays],
  )

  const ok = shifted?.ok ? shifted : null
  const cursor = ok ? Math.min(cursorHours, ok.missionHours) : 0
  const cursorMs = ok ? ok.landingMs + cursor * HOUR_MS : null

  const bodies = useMemo(() => (data && cursorMs !== null ? bodiesAt(data, cursorMs) : null), [data, cursorMs])
  const events = useMemo(() => (data && cursorMs !== null ? cursorCountdown(data, cursorMs) : null), [data, cursorMs])
  const samples = useMemo(
    () =>
      data && ok
        ? sampleRange(data.track, data.horizon, ok.landingMs, ok.landingMs + ok.missionHours * HOUR_MS, 60)
        : [],
    [data, ok],
  )

  return { load: load as AsyncState<SiteData>, retry, data, original, shifted, ok, cursor, cursorMs, bodies, events, samples }
}

export type CardModel = ReturnType<typeof useCardModel>
