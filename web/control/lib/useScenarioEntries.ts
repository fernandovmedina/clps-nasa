'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadSiteData, type SiteData } from './data'
import { launchHref } from './launch'
import type { ReportEntry } from './report'
import { evaluate } from './scenario'
import { shiftIso } from './time'
import { SCENARIO_LETTERS, siteKey, type Scenario } from './types'

export interface EntriesState {
  entries: ReportEntry[]
  pending: boolean
  failed: boolean
}

export function useScenarioEntries(scenarios: Scenario[], delayDays: number, customName: string): EntriesState {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, SiteData | 'error'>>(() => new Map())

  const sites = useMemo(() => {
    const map = new Map<string, Scenario['site']>()
    for (const s of scenarios) map.set(siteKey(s.site), s.site)
    return [...map.entries()]
  }, [scenarios])

  useEffect(() => {
    let live = true
    for (const [key, site] of sites) {
      if (loaded.has(key)) continue
      loadSiteData(site).then(
        (data) => live && setLoaded((prev) => new Map(prev).set(key, data)),
        () => live && setLoaded((prev) => new Map(prev).set(key, 'error')),
      )
    }
    return () => {
      live = false
    }
  }, [sites, loaded])

  return useMemo(() => {
    const entries: ReportEntry[] = []
    let pending = false
    let failed = false
    scenarios.forEach((scenario, index) => {
      const data = loaded.get(siteKey(scenario.site))
      if (data === undefined) {
        pending = true
        return
      }
      if (data === 'error') {
        failed = true
        return
      }
      let result: ReturnType<typeof evaluate>
      try {
        result = evaluate(data, shiftIso(scenario.landing, delayDays), scenario.durationDays)
      } catch {
        failed = true
        return
      }
      if (!result.ok) return
      entries.push({
        letter: SCENARIO_LETTERS[index] ?? String(index + 1),
        name: data.info.name ?? `${customName} (${data.info.lat}°, ${data.info.lon}°)`,
        landingMs: result.landingMs,
        durationDays: scenario.durationDays,
        missionHours: result.missionHours,
        response: result.response,
        approx: data.info.approx,
        horizonSource: data.info.horizonSource,
        launchHref: launchHref(scenario.site, result.landingMs) ?? undefined,
      })
    })
    return { entries, pending, failed }
  }, [scenarios, delayDays, loaded, customName])
}
