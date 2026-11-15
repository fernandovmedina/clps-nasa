'use client'

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { ScenarioStatus } from '@touchdown/core'
import { useI18n } from '@/control/i18n'
import {
  STATUS_HEIGHT,
  computeCalendar,
  countStatuses,
  dayIndexAt,
  dayPosition,
  monthTicks,
  type DayCell,
} from '@/control/lib/calendar'
import { loadSiteData } from '@/control/lib/data'
import { DAY_MS, formatMonth, formatMonthYear, formatUtcDate, isoFromMs, shiftIso } from '@/control/lib/time'
import { siteKey, type Scenario } from '@/control/lib/types'
import { useAsync } from '@/control/lib/useAsync'
import { useWidth } from '@/control/lib/useWidth'
import { statusColor, statusKey } from './CardParts'

const LABEL_H = 22
const STRIP_H = 48
const TOP = 12
const HEIGHT = TOP + LABEL_H + STRIP_H + 6
const MIN_DAY_PX = 4
const STATUSES: ScenarioStatus[] = ['viable', 'marginal', 'not_viable']

interface Props {
  scenario: Scenario
  siteName: string
  delayDays: number
  onPick: (iso: string) => void
}

function Legend({ firstLanding, shiftedLanding }: { firstLanding: string; shiftedLanding: string | null }) {
  const { t } = useI18n()
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption" aria-label={t('calendarLegend')}>
      {STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-2">
          <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
            <rect x="1" y={20 - 20 * STATUS_HEIGHT[s]} width="12" height={20 * STATUS_HEIGHT[s]} rx="2" fill={statusColor(s)} />
          </svg>
          {t(statusKey(s))}
        </li>
      ))}
      <li className="num flex items-center gap-2">
        <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
          <path d="M1 3h12L7 11z" fill="var(--label)" />
        </svg>
        {t('calendarLanding')}: {firstLanding}
      </li>
      {shiftedLanding && (
        <li className="num flex items-center gap-2">
          <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true">
            <path d="M7 2l6 6-6 6-6-6z" fill="none" stroke="var(--accent)" strokeWidth="2" />
          </svg>
          {t('calendarDelayed')}: {shiftedLanding}
        </li>
      )}
    </ul>
  )
}

export function Calendar({ scenario, siteName, delayDays, onPick }: Props) {
  const { t, locale } = useI18n()
  const titleId = useId()
  const descId = useId()
  const key = siteKey(scenario.site)
  const [site, retrySite] = useAsync(key, () => loadSiteData(scenario.site))
  const data = site.status === 'ready' ? site.value : null
  const [cal, retryCal] = useAsync<DayCell[]>(data ? `${key}|${scenario.durationDays}` : null, () =>
    data ? computeCalendar(key, data, scenario.durationDays) : Promise.reject(new Error('no data')),
  )
  const cells = cal.status === 'ready' ? cal.value : null
  const count = cells?.length ?? 0
  const [ref, measured] = useWidth<HTMLDivElement>(900)
  const width = measured
  const cw = count > 0 ? width / count : 0

  const [hover, setHover] = useState<number | null>(null)
  const [focusIdx, setFocusIdx] = useState<number | null>(null)

  const firstMs = cells?.[0]?.ms ?? 0
  const landingMs = Date.parse(scenario.landing)
  const landingIdx = cells ? Math.min(count - 1, Math.max(0, Math.round((landingMs - firstMs) / DAY_MS))) : 0
  const active = hover ?? focusIdx ?? landingIdx
  const activeCell = cells?.[active]

  const counts = useMemo(() => (cells ? countStatuses(cells) : null), [cells])
  const ticks = useMemo(() => (cells ? monthTicks(cells.map((c) => c.ms)) : []), [cells])

  const stateText = (cell: DayCell | undefined) =>
    cell
      ? cell.status
        ? t('calendarDay', { date: `${formatUtcDate(cell.ms)} UTC`, status: t(statusKey(cell.status)), score: cell.score })
        : `${formatUtcDate(cell.ms)} UTC: ${t('calendarUnavailable')}`
      : ''

  const commit = (index: number) => {
    const cell = cells?.[index]
    if (!cell) return
    onPick(isoFromMs(cell.ms))
    setFocusIdx(null)
  }

  const indexFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return dayIndexAt(e.clientX - rect.left, rect.width, count)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const jump: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30 }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(active)
      return
    }
    let next: number | null = null
    if (Object.hasOwn(jump, e.key)) next = active + (jump[e.key] ?? 0)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = count - 1
    if (next === null) return
    e.preventDefault()
    setHover(null)
    setFocusIdx(Math.min(count - 1, Math.max(0, next)))
  }

  const step = (days: number) => onPick(shiftIso(scenario.landing, days))
  const landingText = `${formatUtcDate(landingMs)} UTC`
  const shiftedText = delayDays !== 0 ? `${formatUtcDate(landingMs + delayDays * DAY_MS)} UTC` : null

  let body: React.ReactNode
  if (site.status === 'error' || cal.status === 'error') {
    body = (
      <div role="alert" className="grid gap-3 rounded-control border border-line-strong bg-raised p-4">
        <p>{t('loadError', { site: siteName })}</p>
        <button type="button" className="btn btn-outline justify-self-start" onClick={site.status === 'error' ? retrySite : retryCal}>
          {t('retry')}
        </button>
      </div>
    )
  } else if (!cells || !counts) {
    body = (
      <div className="grid gap-2" role="status">
        <div className="skeleton h-[84px]" />
        <p className="text-caption text-label-2">{t('calendarComputing')}</p>
      </div>
    )
  } else {
    const desc = t('calendarDesc', {
      days: scenario.durationDays,
      start: formatUtcDate(cells[0]?.ms ?? 0),
      end: formatUtcDate(cells[count - 1]?.ms ?? 0),
      viable: counts.viable,
      marginal: counts.marginal,
      notViable: counts.not_viable,
    })
    const marker = (ms: number) => dayPosition(ms, firstMs, count) * cw
    body = (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-3">
            <button type="button" className="btn btn-outline px-0" aria-label={t('calendarPrevWeek')} onClick={() => step(-7)}>
              <ChevronsLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-outline px-0" aria-label={t('calendarPrevDay')} onClick={() => step(-1)}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-outline px-0" aria-label={t('calendarNextDay')} onClick={() => step(1)}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <button type="button" className="btn btn-outline px-0" aria-label={t('calendarNextWeek')} onClick={() => step(7)}>
              <ChevronsRight size={20} aria-hidden="true" />
            </button>
          </div>
          <p className="num text-body" data-testid="calendar-readout">
            {stateText(activeCell)}
          </p>
        </div>
        <div className="overflow-x-auto">
          <div
            ref={ref}
            className="relative min-w-[var(--strip-min)] md:min-w-0"
            style={{ '--strip-min': `${count * MIN_DAY_PX}px` } as React.CSSProperties}
            data-testid="calendar-strip"
            data-ready="true"
          >
            <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descId}`} className="block">
              <title id={titleId}>{t('calendar')}</title>
              <desc id={descId}>{desc}</desc>
              {ticks.map((tick) => {
                const x = tick.index * cw
                const january = new Date(tick.ms).getUTCMonth() === 0
                return (
                  <g key={tick.ms}>
                    <line x1={x} x2={x} y1={TOP + 4} y2={HEIGHT - 6} stroke="var(--line)" strokeWidth={0.5} />
                    <text x={x + 4} y={TOP + 14} fontSize={12} fill="var(--label-2)">
                      {tick.index > 0 && january ? formatMonthYear(tick.ms, locale) : formatMonth(tick.ms, locale)}
                    </text>
                  </g>
                )
              })}
              <line x1={0} x2={width} y1={HEIGHT - 6} y2={HEIGHT - 6} stroke="var(--line-strong)" strokeWidth={0.5} />
              {cells.map((cell, i) => {
                const h = cell.status ? STRIP_H * STATUS_HEIGHT[cell.status] : 3
                return (
                  <rect
                    key={cell.ms}
                    x={i * cw + (cw > 3 ? 0.5 : 0.25)}
                    y={HEIGHT - 6 - h}
                    width={Math.max(1, cw - (cw > 3 ? 1 : 0.5))}
                    height={h}
                    fill={cell.status ? statusColor(cell.status) : 'var(--label-3)'}
                  />
                )
              })}
              <rect x={active * cw - 1} y={TOP + LABEL_H - 4} width={Math.max(3, cw) + 2} height={STRIP_H + 4} fill="none" stroke="var(--label)" strokeWidth={1.5} rx={1} />
              <g>
                <line x1={marker(landingMs)} x2={marker(landingMs)} y1={TOP + LABEL_H - 4} y2={HEIGHT - 6} stroke="var(--label)" strokeWidth={2} />
                <path d={`M${marker(landingMs) - 6} ${TOP - 4}h12l-6 9z`} fill="var(--label)" />
              </g>
              {shiftedText && (
                <g>
                  <line x1={marker(landingMs + delayDays * DAY_MS)} x2={marker(landingMs + delayDays * DAY_MS)} y1={TOP + LABEL_H - 4} y2={HEIGHT - 6} stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" />
                  <path d={`M${marker(landingMs + delayDays * DAY_MS)} ${TOP - 6}l6 6-6 6-6-6z`} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={2} />
                </g>
              )}
            </svg>
            <div
              role="slider"
              tabIndex={0}
              aria-label={t('calendar')}
              aria-roledescription="day picker"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={count - 1}
              aria-valuenow={active}
              aria-valuetext={stateText(activeCell)}
              className="absolute inset-0 cursor-pointer rounded-md"
              data-testid="calendar-slider"
              onKeyDown={onKeyDown}
              onBlur={() => setFocusIdx(null)}
              onPointerMove={(e) => setHover(indexFromPointer(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                commit(dayIndexAt(e.clientX - rect.left, rect.width, count))
              }}
            />
          </div>
        </div>
        <Legend firstLanding={landingText} shiftedLanding={shiftedText} />
        <p className="text-caption text-label-2">{t('calendarHint')}</p>
      </>
    )
  }

  return (
    <section className="card grid gap-4 p-6" aria-labelledby="calendar-title" data-testid="calendar">
      <div className="grid gap-1">
        <h2 id="calendar-title" className="text-title">
          {t('calendar')}
        </h2>
        <p className="text-body text-label-2">{t('calendarQuestion', { site: siteName })}</p>
      </div>
      {body}
    </section>
  )
}
