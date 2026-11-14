'use client'

import { useId, useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import type { EphemerisSample, HorizonFile } from '@touchdown/core'
import { useI18n } from '@/control/i18n'
import { formatNumber } from '@/control/lib/format'
import { horizonCurve, niceElevationTicks, splitRuns, type Point } from '@/control/lib/charts'
import type { BodyAt } from '@/control/lib/scenario'
import { useWidth } from '@/control/lib/useWidth'
import { BodyGlyph } from './BodyGlyph'

const MARGIN = { top: 14, right: 14, bottom: 32, left: 44 }
const HEIGHT = 248

interface Props {
  horizon: HorizonFile
  samples: EphemerisSample[]
  sun: BodyAt | null
  earth: BodyAt | null
  title: string
  desc: string
}

export function Panorama({ horizon, samples, sun, earth, title, desc }: Props) {
  const { t, locale } = useI18n()
  const [ref, width] = useWidth<HTMLDivElement>(560)
  const titleId = useId()
  const descId = useId()
  const clipId = useId()

  const view = useMemo(() => {
    const curve = horizonCurve(horizon.horizon_deg, horizon.az_step_deg)
    const heights = curve.map((p) => p[1])
    const yMin = Math.floor(Math.min(...heights) - 2)
    const yMax = Math.max(25, Math.ceil(Math.max(...heights) + 3))
    return { curve, yMin, yMax }
  }, [horizon])

  const x = scaleLinear().domain([-180, 180]).range([MARGIN.left, width - MARGIN.right])
  const y = scaleLinear().domain([view.yMin, view.yMax]).range([HEIGHT - MARGIN.bottom, MARGIN.top])
  const plotBottom = HEIGHT - MARGIN.bottom

  const terrainArea = area<Point>()
    .x((p) => x(p[0]))
    .y0(plotBottom)
    .y1((p) => y(p[1]))(view.curve)
  const terrainLine = line<Point>()
    .x((p) => x(p[0]))
    .y((p) => y(p[1]))(view.curve)
  const path = line<Point>()
    .x((p) => x(p[0]))
    .y((p) => y(p[1]))

  const runs = useMemo(
    () => ({ sun: splitRuns(samples, 'sun'), earth: splitRuns(samples, 'earth') }),
    [samples],
  )

  const compass: [number, string][] = [
    [-180, t('compassS')],
    [-90, t('compassW')],
    [0, t('compassN')],
    [90, t('compassE')],
    [180, t('compassS')],
  ]
  const ticks = niceElevationTicks(view.yMin, view.yMax)

  const marker = (body: BodyAt | null, kind: 'sun' | 'earth') => {
    if (!body) return null
    const az = ((body.az % 360) + 360) % 360
    const px = x(az > 180 ? az - 360 : az)
    const above = body.el > view.yMax
    const below = body.el < view.yMin
    const py = above ? MARGIN.top + 6 : below ? plotBottom - 6 : y(body.el)
    const name = kind === 'sun' ? t('bodySun') : t('bodyEarth')
    const anchor = px > width - 120 ? 'end' : 'start'
    return (
      <g key={kind}>
        <BodyGlyph kind={kind} x={px} y={py} size={above || below ? 6 : 8} faded={!body.visible} />
        {(above || below) && (
          <text
            x={anchor === 'end' ? px - 12 : px + 12}
            y={py + 5}
            textAnchor={anchor}
            fontSize={12}
            className="num"
            fill="var(--label)"
          >
            {`${name} ${formatNumber(locale, body.el)}° ${above ? '↑' : '↓'}`}
          </text>
        )}
      </g>
    )
  }

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        className="block"
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{desc}</desc>
        <defs>
          <clipPath id={clipId}>
            <rect x={MARGIN.left} y={MARGIN.top} width={width - MARGIN.left - MARGIN.right} height={plotBottom - MARGIN.top} />
          </clipPath>
        </defs>
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={width - MARGIN.left - MARGIN.right}
          height={plotBottom - MARGIN.top}
          fill="var(--bg-field)"
        />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--line-strong)' : 'var(--line)'} strokeWidth={1} />
            <text x={MARGIN.left - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--label-2)" className="num">
              {v}°
            </text>
          </g>
        ))}
        {compass.map(([az, label]) => (
          <g key={az}>
            <line x1={x(az)} x2={x(az)} y1={MARGIN.top} y2={plotBottom} stroke="var(--line)" strokeWidth={0.5} />
            <text
              x={x(az)}
              y={HEIGHT - 10}
              textAnchor={az === -180 ? 'start' : az === 180 ? 'end' : 'middle'}
              fontSize={12}
              fontWeight={az === 0 ? 600 : 500}
              fill={az === 0 ? 'var(--label)' : 'var(--label-2)'}
            >
              {label}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          <path d={terrainArea ?? undefined} fill="var(--terrain)" />
          <path d={terrainLine ?? undefined} fill="none" stroke="var(--terrain-line)" strokeWidth={1} />
          {(['earth', 'sun'] as const).map((body) =>
            runs[body].map((run, i) => (
              <path
                key={`${body}-${i}`}
                d={path(run.points) ?? undefined}
                fill="none"
                stroke={body === 'sun' ? 'var(--sun)' : 'var(--earth)'}
                strokeWidth={run.visible ? 2.5 : 1.5}
                strokeDasharray={run.visible ? undefined : '3 4'}
                strokeOpacity={run.visible ? 1 : 0.55}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )),
          )}
        </g>
        {marker(earth, 'earth')}
        {marker(sun, 'sun')}
      </svg>
    </div>
  )
}
