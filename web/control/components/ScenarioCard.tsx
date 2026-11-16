'use client'

import { useEffect } from 'react'
import { Copy, Earth, Rocket, Sun, Sunrise, Sunset, X } from 'lucide-react'
import { useI18n, type Translate } from '@/control/i18n'
import { UnknownSiteError } from '@/control/lib/data'
import { formatNumber } from '@/control/lib/format'
import { countdown, formatDuration, type CountdownResult } from '@/control/lib/countdown'
import { launchHref } from '@/control/lib/launch'
import { maskedBy } from '@/control/lib/scenario'
import type { CardModel } from '@/control/lib/useCardModel'
import { useCardModel } from '@/control/lib/useCardModel'
import { DAY_MS, HOUR_MS, formatUtc, fromInputValue, shiftIso, toInputValue, formatUtcDate } from '@/control/lib/time'
import {
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
  SCENARIO_LETTERS,
  type Scenario,
} from '@/control/lib/types'
import { Delta, Field, MetricBar, NumberField, StatusChange, StatusPill } from './CardParts'
import { Panorama } from './Panorama'
import { SkyDiagram, skyDomain } from './SkyDiagram'
import { Timeline } from './Timeline'
import { BodyGlyph } from './BodyGlyph'

interface Props {
  index: number
  scenario: Scenario
  selected: boolean
  multiple: boolean
  canDuplicate: boolean
  delayDays: number
  cursorHours: number
  playing: boolean
  reducedMotion: boolean
  onSelect: () => void
  onLanding: (iso: string) => void
  onDuration: (days: number) => void
  onDuplicate: () => void
  onRemove: () => void
  onCursor: (hours: number) => void
  onAdvance: (max: number) => void
  onTogglePlay: () => void
  onChooseSite: () => void
}

function countdownText(
  t: Translate,
  body: 'sun' | 'earth',
  r: CountdownResult,
  ctx: { landingMs: number; dataEndMs: number },
): string {
  if (r.kind === 'set-after-mission') {
    const day = Math.floor((r.atMs - ctx.landingMs) / DAY_MS)
    return t(body === 'sun' ? 'sunSetAfter' : 'earthSetAfter', { day })
  }
  if (r.kind === 'event') {
    const d = formatDuration(r.remainingMs)
    if (body === 'sun') return t(r.event === 'set' ? 'sunSet' : 'sunRise', { d })
    return t(r.event === 'set' ? 'earthSet' : 'earthRise', { d })
  }
  if (r.kind === 'no-set') return t(body === 'sun' ? 'sunNoSet' : 'earthNoSet', { date: formatUtcDate(ctx.dataEndMs) })
  if (r.kind === 'no-rise') return t(body === 'sun' ? 'sunNoRise' : 'earthNoRise')
  return t(body === 'sun' ? 'sunNever' : 'earthNever')
}

function CardSkeleton() {
  const { t } = useI18n()
  return (
    <div className="grid gap-4" role="status" aria-label={t('loading')}>
      <div className="skeleton h-12" />
      <div className="grid grid-cols-[1fr_160px] gap-4">
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton h-24" />
      <div className="skeleton h-56" />
      <div className="skeleton h-28" />
    </div>
  )
}

function Notice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="grid gap-3 rounded-control border border-line-strong bg-raised p-4">
      <p className="text-body">{children}</p>
      {action}
    </div>
  )
}

export function ScenarioCard(props: Props) {
  const { index, scenario, selected, multiple, delayDays, cursorHours } = props
  const { t, locale } = useI18n()
  const model: CardModel = useCardModel(scenario, delayDays, cursorHours)
  const { data, original, shifted, ok, cursor, cursorMs, bodies, events, samples } = model
  const letter = SCENARIO_LETTERS[index] ?? String(index + 1)
  const fmt = (n: number, digits = 1) => formatNumber(locale, n, digits)

  const name = data ? (data.info.name ?? t('customName')) : '…'
  const siteLabel = data
    ? data.info.custom
      ? `${fmt(data.info.lat, 2)}°, ${fmt(data.info.lon, 2)}°`
      : `${data.info.program} · ${fmt(data.info.lat, 2)}°, ${fmt(data.info.lon, 2)}°`
    : ''

  const response = ok?.response
  const { playing, onAdvance, onTogglePlay } = props
  const missionHours = ok?.missionHours ?? 0
  const missionEndMs = ok ? ok.landingMs + ok.missionHours * HOUR_MS : undefined

  useEffect(() => {
    if (!playing || !selected || missionHours <= 0) return
    const id = window.setInterval(() => onAdvance(missionHours), 100)
    return () => window.clearInterval(id)
  }, [playing, selected, missionHours, onAdvance])

  useEffect(() => {
    if (playing && selected && missionHours > 0 && cursor >= missionHours) onTogglePlay()
  }, [playing, selected, missionHours, cursor, onTogglePlay])
  const sunState = bodies ? t(bodies.sun.visible ? 'visible' : 'belowHorizon') : ''
  const earthState = bodies ? t(bodies.earth.visible ? 'visible' : 'belowHorizon') : ''

  const horizonMin = data ? Math.min(...data.horizon.horizon_deg) : 0
  const horizonMax = data ? Math.max(...data.horizon.horizon_deg) : 0
  const domain =
    data && response ? skyDomain(data.horizon, Math.max(response.sun.max_elev, response.earth.max_elev)) : null

  const launch = ok ? launchHref(scenario.site, ok.landingMs) : null
  const showDelta = delayDays !== 0 && original?.ok && shifted?.ok
  const rangeError = shifted && !shifted.ok && shifted.reason === 'range' ? shifted : null

  let body: React.ReactNode
  if (model.load.status === 'loading') body = <CardSkeleton />
  else if (model.load.status === 'error' && model.load.error instanceof UnknownSiteError)
    body = (
      <Notice
        action={
          <button type="button" className="btn btn-outline justify-self-start" onClick={props.onChooseSite}>
            {t('chooseOtherSite')}
          </button>
        }
      >
        {t('unknownSite')}
      </Notice>
    )
  else if (model.load.status === 'error')
    body = (
      <Notice
        action={
          <button type="button" className="btn btn-outline justify-self-start" onClick={model.retry}>
            {t('retry')}
          </button>
        }
      >
        {t('loadError', { site: scenario.site.kind === 'catalog' ? scenario.site.id : t('customName') })}
      </Notice>
    )
  else if (rangeError)
    body = (
      <Notice>
        {t('outOfRange', { start: formatUtcDate(rangeError.startMs), end: formatUtcDate(rangeError.endMs) })}
      </Notice>
    )
  else if (shifted && !shifted.ok) body = <Notice>{t('invalidDate')}</Notice>
  else if (data && ok && response && domain) {
    const sunEvent = events
      ? countdown({
          visibleNow: events.sun.visible_now,
          nextSet: events.sun.next_set,
          nextRise: events.sun.next_rise,
          nowMs: cursorMs ?? 0,
          neverVisible: response.windows.sun.length === 0,
          missionEndMs,
        })
      : null
    const earthEvent = events
      ? countdown({
          visibleNow: events.earth.visible_now,
          nextSet: events.earth.next_set,
          nextRise: events.earth.next_rise,
          nowMs: cursorMs ?? 0,
          neverVisible: response.windows.earth.length === 0,
          missionEndMs,
        })
      : null
    const hours = (n: number) => t('hoursUnit', { n: fmt(n) })
    const countdownCtx = { landingMs: ok.landingMs, dataEndMs: data.seriesEndMs }
    const maskedText = (body: { el: number; horizonEl: number; visible: boolean; az: number } | undefined) => {
      const m = body ? maskedBy(body) : null
      return m ? t('maskedDetail', { el: fmt(m.el), horizon: fmt(m.horizonEl), gap: fmt(m.gap) }) : null
    }
    const sunMasked = maskedText(bodies?.sun)
    const earthMasked = maskedText(bodies?.earth)
    const siteTitle = name
    const desc = {
      panorama: t('panoramaDesc', {
        min: fmt(horizonMin),
        max: fmt(horizonMax),
        sunEl: bodies ? fmt(bodies.sun.el) : '–',
        sunState,
        earthEl: bodies ? fmt(bodies.earth.el) : '–',
        earthState,
      }),
      sky: t('skyDesc', {
        top: domain.top,
        bottom: domain.bottom,
        sunEl: bodies ? fmt(bodies.sun.el) : '–',
        sunAz: bodies ? fmt(bodies.sun.az) : '–',
        sunState,
        earthEl: bodies ? fmt(bodies.earth.el) : '–',
        earthState,
      }),
      timeline: t('timelineDesc', {
        hours: Math.round(ok.missionHours),
        sun: fmt(response.sun.hours_visible),
        earth: fmt(response.earth.hours_visible),
        both: fmt(response.fractions.both * ok.missionHours),
        cursor: Math.round(cursor),
      }),
    }

    body = (
      <>
        <div className="grid gap-6 @xl:grid-cols-[minmax(0,1fr)_minmax(0,256px)]">
          <div className="grid content-start gap-6">
            <div className="flex flex-nowrap items-center gap-x-4" data-testid="status-score">
              <StatusPill status={response.status} />
              <p className="num whitespace-nowrap text-title" data-testid="score">
                <span className="sr-only">{t('score')}: </span>
                {t('scoreValue', { n: response.score })}
              </p>
            </div>
            <div className="grid gap-1">
              <p className="flex items-center gap-2 text-label text-label-2">
                <Sun size={16} aria-hidden="true" style={{ color: 'var(--sun)' }} />
                {t('solarElevation')} · {t('atCursor')}
              </p>
              <p className="num text-display" data-testid="sun-elevation">
                {bodies ? `${fmt(bodies.sun.el)}°` : '–'}
              </p>
              <p className="num text-caption text-label-2">
                {t('solarAzimuth')} {bodies ? `${fmt(bodies.sun.az)}°` : '–'} · {sunState}
              </p>
              {sunMasked && (
                <p className="num text-caption text-label-2" data-testid="sun-masked">
                  {sunMasked}
                </p>
              )}
            </div>
            <div className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
              <Earth size={18} aria-hidden="true" style={{ color: 'var(--earth)' }} />
              <span>
                {t('earthElevation')} {bodies ? `${fmt(bodies.earth.el)}°` : '–'}
              </span>
              <span className="text-label-2">{earthState}</span>
              {earthMasked && (
                <span className="basis-full text-caption text-label-2" data-testid="earth-masked">
                  {earthMasked}
                </span>
              )}
            </div>
          </div>
          <div className="slate grid content-start gap-3 rounded-[10px] p-4">
            <SkyDiagram
              horizon={data.horizon}
              samples={samples}
              sun={bodies?.sun ?? null}
              earth={bodies?.earth ?? null}
              top={domain.top}
              bottom={domain.bottom}
              title={t('skyTitle', { site: siteTitle })}
              desc={desc.sky}
            />
            <ul className="grid gap-1 text-label font-normal text-label-2">
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-line-strong bg-field" />
                {t('skyLegendSky')}
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-[var(--terrain)]" />
                {t('skyLegendTerrain')}
              </li>
            </ul>
          </div>
        </div>

        {launch && (
          <a
            href={launch}
            className="btn btn-solid no-print justify-self-start whitespace-normal py-2 text-center"
            data-testid="launch-link"
          >
            <Rocket size={18} aria-hidden="true" className="shrink-0" />
            {t('launchMission')}
          </a>
        )}

        {showDelta && original?.ok && (
          <div className="grid gap-2" role="group" aria-label={t('frontOriginal')} data-testid="deltas">
            <p className="text-label text-label-2">{t('frontOriginal')}</p>
            <div className="grid grid-cols-1 gap-2 @md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Delta label={t('deltaScore')} value={response.score - original.response.score} prominent />
              <StatusChange label={t('statusChange')} from={original.response.status} to={response.status} />
            </div>
            <div className="grid grid-cols-1 gap-2 @md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Delta label={t('deltaSun')} value={response.sun.hours_visible - original.response.sun.hours_visible} unit=" h" />
              <Delta label={t('deltaEarth')} value={response.earth.hours_visible - original.response.earth.hours_visible} unit=" h" />
            </div>
          </div>
        )}

        <div className="grid gap-4 @sm:grid-cols-3">
          <MetricBar label={t('hoursSun')} value={hours(response.sun.hours_visible)} fraction={response.fractions.sun} color="var(--sun)" />
          <MetricBar label={t('hoursEarth')} value={hours(response.earth.hours_visible)} fraction={response.fractions.earth} color="var(--earth)" />
          <MetricBar label={t('hoursBoth')} value={hours(response.fractions.both * ok.missionHours)} fraction={response.fractions.both} color="var(--both)" />
        </div>
        {response.truncated && <p className="text-caption text-label-2">{t('truncatedNote')}</p>}

        <ul className="grid gap-2 text-body">
          {sunEvent && (
            <li className="flex items-center gap-3" data-testid="sun-countdown">
              {sunEvent.kind === 'event' && sunEvent.event === 'rise' ? (
                <Sunrise size={20} aria-hidden="true" style={{ color: 'var(--sun)' }} />
              ) : (
                <Sunset size={20} aria-hidden="true" style={{ color: 'var(--sun)' }} />
              )}
              <span className="num">{countdownText(t, 'sun', sunEvent, countdownCtx)}</span>
            </li>
          )}
          {earthEvent && (
            <li className="flex items-center gap-3" data-testid="earth-countdown">
              <Earth size={20} aria-hidden="true" style={{ color: 'var(--earth)' }} />
              <span className="num">{countdownText(t, 'earth', earthEvent, countdownCtx)}</span>
            </li>
          )}
        </ul>

        <section className="slate grid min-w-0 grid-cols-1 gap-3 rounded-[10px] p-4" aria-label={t('panorama')}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h3 className="text-caption font-semibold">{t('panorama')}</h3>
            <p className="flex items-center gap-4 text-caption text-label-2">
              <span className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <BodyGlyph kind="sun" x={10} y={10} size={5} />
                </svg>
                {t('bodySun')}
              </span>
              <span className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <BodyGlyph kind="earth" x={10} y={10} size={6} />
                </svg>
                {t('bodyEarth')}
              </span>
            </p>
          </div>
          <Panorama
            horizon={data.horizon}
            samples={samples}
            sun={bodies?.sun ?? null}
            earth={bodies?.earth ?? null}
            title={t('panoramaTitle', { site: siteTitle })}
            desc={desc.panorama}
          />
        </section>

        <section className="grid min-w-0 grid-cols-1 gap-3" aria-label={t('timeline')}>
          <h3 className="text-label text-label-2">{t('timeline')}</h3>
          <Timeline
            windows={response.windows}
            landingMs={ok.landingMs}
            missionHours={ok.missionHours}
            cursorHours={cursor}
            playing={props.playing}
            reducedMotion={props.reducedMotion}
            title={t('timelineTitle', { site: siteTitle })}
            desc={desc.timeline}
            onCursor={props.onCursor}
            onTogglePlay={() => {
              if (!playing) {
                props.onSelect()
                if (cursor >= missionHours) props.onCursor(0)
              }
              onTogglePlay()
            }}
          />
        </section>
      </>
    )
  } else body = <CardSkeleton />

  return (
    <article
      className="card @container grid min-w-0 grid-cols-1 content-start gap-6 p-6"
      style={selected && multiple ? { outline: '1px solid var(--label-2)' } : undefined}
      aria-labelledby={`card-title-${index}`}
      data-testid="scenario-card"
      data-selected={selected}
    >
      <header className="grid grid-cols-1 gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="btn btn-outline shrink-0 px-0"
            aria-pressed={selected}
            aria-label={t('selectScenario', { letter })}
            onClick={props.onSelect}
          >
            {letter}
          </button>
          <div className="min-w-0 flex-1">
            <h2 id={`card-title-${index}`} className="text-title break-words" data-testid="card-title">
              {name}
            </h2>
            <p className="num text-caption text-label-2">{siteLabel}</p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              className="btn btn-quiet px-0"
              aria-label={t('duplicateLabel', { letter })}
              disabled={!props.canDuplicate}
              onClick={props.onDuplicate}
            >
              <Copy size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-quiet px-0"
              aria-label={t('removeLabel', { letter })}
              disabled={!multiple}
              onClick={props.onRemove}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        {data && (
          <ul className="flex flex-wrap gap-2 text-label">
            <li className="rounded-full border-[0.5px] border-line-strong px-2.5 py-1">
              {data.info.horizonSource === 'lola' ? t('sourceLola') : t('sourceSpherical')}
            </li>
            {data.info.approx && <li className="rounded-full border-[0.5px] border-line-strong px-2.5 py-1">{t('approximate')}</li>}
            {selected && multiple && <li className="rounded-full bg-selected px-2.5 py-1">{t('selected')}</li>}
          </ul>
        )}
        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-[minmax(0,1fr)_112px]">
          <Field label={t('landing')}>
            {(id) => (
              <input
                id={id}
                className="field num"
                type="datetime-local"
                value={toInputValue(scenario.landing)}
                onChange={(e) => {
                  const iso = fromInputValue(e.target.value)
                  if (iso) props.onLanding(iso)
                }}
              />
            )}
          </Field>
          <Field label={t('duration')}>
            {(id) => (
              <NumberField
                id={id}
                value={scenario.durationDays}
                min={MIN_DURATION_DAYS}
                max={MAX_DURATION_DAYS}
                onCommit={props.onDuration}
              />
            )}
          </Field>
        </div>
        <div className="num grid gap-1 text-caption text-label-2">
          <p data-testid="landing-utc">
            {t('landingUtc')}: {formatUtc(Date.parse(scenario.landing))}
          </p>
          {delayDays !== 0 && (
            <p data-testid="shifted-landing">
              {t('delayedLanding')}: {formatUtc(Date.parse(shiftIso(scenario.landing, delayDays)))}
            </p>
          )}
        </div>
      </header>
      {body}
    </article>
  )
}
