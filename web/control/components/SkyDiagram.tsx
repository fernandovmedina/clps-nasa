'use client'

import { useId, useMemo } from 'react'
import { line } from 'd3-shape'
import type { EphemerisSample, HorizonFile } from '@touchdown/core'
import { useI18n } from '@/control/i18n'
import { splitRuns, type Point } from '@/control/lib/charts'
import type { BodyAt } from '@/control/lib/scenario'
import { BodyGlyph } from './BodyGlyph'

const SIZE = 232
const PAD = 26
const RADIUS = SIZE / 2 - PAD
const CENTER = SIZE / 2

function projectSky(az: number, el: number, top: number, bottom: number): Point {
  const r = Math.min(RADIUS, Math.max(0, (RADIUS * (top - el)) / (top - bottom)))
  const a = (az * Math.PI) / 180
  return [CENTER + r * Math.sin(a), CENTER - r * Math.cos(a)]
}

export function skyDomain(horizon: HorizonFile, maxBodyEl: number): { top: number; bottom: number } {
  const bottom = Math.floor(Math.min(...horizon.horizon_deg) - 2)
  const top = Math.min(90, Math.max(10, Math.ceil(maxBodyEl + 2)))
  return { top, bottom }
}

interface Props {
  horizon: HorizonFile
  samples: EphemerisSample[]
  sun: BodyAt | null
  earth: BodyAt | null
  top: number
  bottom: number
  title: string
  desc: string
}

export function SkyDiagram({ horizon, samples, sun, earth, top, bottom, title, desc }: Props) {
  const { t } = useI18n()
  const titleId = useId()
  const descId = useId()
  const c = CENTER
  const project = (az: number, el: number): Point => projectSky(az, el, top, bottom)

  const terrain = useMemo(() => {
    const n = horizon.horizon_deg.length
    const pts = horizon.horizon_deg
      .map((el, i) => projectSky((i * 360) / n, el, top, bottom))
      .map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join('L')
    const outline = `M${pts}Z`
    const disc = `M${CENTER - RADIUS} ${CENTER}a${RADIUS} ${RADIUS} 0 1 0 ${2 * RADIUS} 0a${RADIUS} ${RADIUS} 0 1 0 ${-2 * RADIUS} 0Z`
    return { fill: `${disc}${outline}`, outline }
  }, [horizon, top, bottom])

  const runs = useMemo(() => {
    const toPath = (body: 'sun' | 'earth') =>
      splitRuns(samples, body).map((run) => ({
        visible: run.visible,
        d: line()(run.points.map(([az, el]) => projectSky(az, el, top, bottom))) ?? '',
      }))
    return { sun: toPath('sun'), earth: toPath('earth') }
  }, [samples, top, bottom])

  const rings = [0, 10, 30, 60].filter((v) => v > bottom && v < top)
  const ringRadius = (el: number) => (RADIUS * (top - el)) / (top - bottom)
  const cardinal: [number, number, string][] = [
    [c, 16, t('compassN')],
    [SIZE - 10, c + 5, t('compassE')],
    [c, SIZE - 6, t('compassS')],
    [10, c + 5, t('compassW')],
  ]

  const bodyAt = (b: BodyAt | null, kind: 'sun' | 'earth') => {
    if (!b) return null
    const [px, py] = project(b.az, b.el)
    return <BodyGlyph key={kind} kind={kind} x={px} y={py} size={6} faded={!b.visible} />
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      className="mx-auto block max-w-[232px]"
    >
      <title id={titleId}>{title}</title>
      <desc id={descId}>{desc}</desc>
      <circle cx={c} cy={c} r={RADIUS} fill="var(--bg-field)" stroke="var(--line-strong)" strokeWidth={1} />
      <path d={terrain.fill} fillRule="evenodd" fill="var(--terrain)" />
      <path d={terrain.outline} fill="none" stroke="var(--terrain-line)" strokeWidth={1} strokeLinejoin="round" />
      {rings.map((v) => (
        <g key={v}>
          <circle
            cx={c}
            cy={c}
            r={ringRadius(v)}
            fill="none"
            stroke={v === 0 ? 'var(--line-strong)' : 'var(--line)'}
            strokeWidth={1}
          />
          <text x={c + 4} y={c - ringRadius(v) + 14} fontSize={12} fill="var(--label-2)" className="num">
            {v}°
          </text>
        </g>
      ))}
      <line x1={c} x2={c} y1={c - RADIUS} y2={c + RADIUS} stroke="var(--line)" strokeWidth={1} />
      <line x1={c - RADIUS} x2={c + RADIUS} y1={c} y2={c} stroke="var(--line)" strokeWidth={1} />
      {(['earth', 'sun'] as const).map((body) =>
        runs[body].map((run, i) => (
          <path
            key={`${body}-${i}`}
            d={run.d}
            fill="none"
            stroke={body === 'sun' ? 'var(--sun)' : 'var(--earth)'}
            strokeWidth={run.visible ? 2 : 1.25}
            strokeDasharray={run.visible ? undefined : '3 4'}
            strokeOpacity={run.visible ? 1 : 0.55}
            strokeLinecap="round"
          />
        )),
      )}
      {cardinal.map(([x, y, label]) => (
        <text key={label + x} x={x} y={y} textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--label-2)">
          {label}
        </text>
      ))}
      {bodyAt(earth, 'earth')}
      {bodyAt(sun, 'sun')}
    </svg>
  )
}
