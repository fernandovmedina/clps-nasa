import type { ScenarioResponse } from '@touchdown/core'
import type { Translate } from '@/control/i18n'
import { formatNumber } from './format'
import { HOUR_MS, formatUtc } from './time'

export interface ReportEntry {
  letter: string
  name: string
  landingMs: number
  durationDays: number
  missionHours: number
  response: ScenarioResponse
  approx: boolean
  horizonSource: 'lola' | 'spherical'
  launchHref?: string
}

export type Risk =
  | { id: 'earthNever' }
  | { id: 'earthStart'; whenMs: number }
  | { id: 'earthBelow'; whenMs: number }
  | { id: 'sunBelow'; percent: number; longestNightHours: number }
  | { id: 'sunLow'; elevation: number }
  | { id: 'truncated' }
  | { id: 'spherical' }
  | { id: 'approx' }

export const SUN_LOW_ELEVATION_DEG = 5

export function longestSunNightHours(entry: ReportEntry): number {
  const start = entry.landingMs
  const end = missionEndMs(entry)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0

  const intervals: [number, number][] = []
  for (const [startIso, endIso] of entry.response.windows.sun) {
    const rawStart = Date.parse(startIso)
    const rawEnd = Date.parse(endIso)
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue
    const winStart = Math.max(start, Math.min(end, rawStart))
    const winEnd = Math.max(start, Math.min(end, rawEnd))
    if (winEnd > winStart) intervals.push([winStart, winEnd])
  }
  intervals.sort((a, b) => a[0] - b[0])

  let cursor = start
  let maxGapMs = 0
  for (const [winStart, winEnd] of intervals) {
    if (winStart > cursor) {
      maxGapMs = Math.max(maxGapMs, winStart - cursor)
    }
    if (winEnd > cursor) {
      cursor = winEnd
    }
  }
  if (end > cursor) {
    maxGapMs = Math.max(maxGapMs, end - cursor)
  }
  const hours = maxGapMs / HOUR_MS
  return Math.round(hours * 10) / 10
}

export function bothHours(entry: ReportEntry): number {
  return entry.response.fractions.both * entry.missionHours
}

/** A not-viable scenario never beats a marginal one, whatever its score (same rule as compareScenarios). */
const STATUS_TIER = { viable: 0, marginal: 1, not_viable: 2 } as const

export function pickRecommended(entries: ReportEntry[]): ReportEntry | null {
  let best: ReportEntry | null = null
  for (const entry of entries) {
    if (best === null) {
      best = entry
      continue
    }
    const ta = STATUS_TIER[entry.response.status]
    const tb = STATUS_TIER[best.response.status]
    if (ta !== tb) {
      if (ta < tb) best = entry
      continue
    }
    const a = entry.response.score
    const b = best.response.score
    if (a !== b) {
      if (a > b) best = entry
      continue
    }
    const ha = bothHours(entry)
    const hb = bothHours(best)
    if (ha !== hb) {
      if (ha > hb) best = entry
      continue
    }
    if (entry.landingMs < best.landingMs) best = entry
  }
  return best
}

export function risksFor(entry: ReportEntry): Risk[] {
  const { response } = entry
  const risks: Risk[] = []
  const earth = response.windows.earth
  const first = earth[0]
  if (first === undefined) {
    risks.push({ id: 'earthNever' })
  } else if (response.fractions.earth < 1) {
    const start = Date.parse(first[0])
    if (start > entry.landingMs + 60_000) risks.push({ id: 'earthStart', whenMs: start })
    else risks.push({ id: 'earthBelow', whenMs: Date.parse(first[1]) })
  }
  if (entry.missionHours > 0 && response.fractions.sun < 1) {
    risks.push({
      id: 'sunBelow',
      percent: Math.max(1, Math.round((1 - response.fractions.sun) * 100)),
      longestNightHours: longestSunNightHours(entry),
    })
  }
  if (response.sun.max_elev < SUN_LOW_ELEVATION_DEG) {
    risks.push({ id: 'sunLow', elevation: response.sun.max_elev })
  }
  if (response.truncated) risks.push({ id: 'truncated' })
  if (entry.horizonSource === 'spherical') risks.push({ id: 'spherical' })
  if (entry.approx) risks.push({ id: 'approx' })
  return risks
}

export function riskText(t: Translate, locale: string, risk: Risk): string {
  switch (risk.id) {
    case 'earthNever':
      return t('riskEarthNever')
    case 'earthStart':
      return t('riskEarthStart', { when: formatUtc(risk.whenMs) })
    case 'earthBelow':
      return t('riskEarthBelow', { when: formatUtc(risk.whenMs) })
    case 'sunBelow':
      return t('riskSunBelow', { pct: risk.percent, hours: formatNumber(locale, risk.longestNightHours) })
    case 'sunLow':
      return t('riskSunLow', { el: formatNumber(locale, risk.elevation) })
    case 'truncated':
      return t('riskTruncated')
    case 'spherical':
      return t('riskSpherical')
    case 'approx':
      return t('riskApprox')
  }
}

const STATUS_KEYS = {
  viable: 'statusViable',
  marginal: 'statusMarginal',
  not_viable: 'statusNotViable',
} as const

export function buildMarkdown(
  entries: ReportEntry[],
  recommended: ReportEntry | null,
  delayDays: number,
  t: Translate,
  locale: string,
): string {
  const hours = (n: number) => formatNumber(locale, n)
  const lines: string[] = [`# ${t('markdownTitle')}`, '']
  if (delayDays !== 0) lines.push(t('reportDelay', { n: delayDays }), '')
  if (recommended) {
    lines.push(
      `**${t('recommendedScenario')}:** ${recommended.letter} · ${recommended.name} · ${formatUtc(recommended.landingMs)} · ${t(STATUS_KEYS[recommended.response.status])} · ${t('scoreValue', { n: recommended.response.score })}`,
      '',
    )
  }
  lines.push(
    `| ${t('colScenario')} | ${t('colSite')} | ${t('colLanding')} | ${t('colStatus')} | ${t('colScore')} | ${t('colSun')} | ${t('colEarth')} | ${t('colBoth')} |`,
    '|---|---|---|---|---:|---:|---:|---:|',
  )
  for (const e of entries) {
    lines.push(
      `| ${e.letter} | ${e.name} | ${formatUtc(e.landingMs)} | ${t(STATUS_KEYS[e.response.status])} | ${e.response.score} | ${hours(e.response.sun.hours_visible)} | ${hours(e.response.earth.hours_visible)} | ${hours(bothHours(e))} |`,
    )
  }
  lines.push('', `## ${t('risks')}`, '')
  for (const e of entries) {
    const risks = risksFor(e)
    lines.push(`### ${e.letter} · ${e.name}`)
    if (risks.length === 0) lines.push(`- ${t('noRisks')}`)
    for (const risk of risks) lines.push(`- ${riskText(t, locale, risk)}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

export function missionEndMs(entry: ReportEntry): number {
  return entry.landingMs + entry.missionHours * HOUR_MS
}
