'use client'

import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Interval } from '@touchdown/core'
import { useI18n } from '@/control/i18n'
import { dayTickStep } from '@/control/lib/charts'
import { HOUR_MS, formatUtc } from '@/control/lib/time'
import { useWidth } from '@/control/lib/useWidth'

const LABEL_W = 68
const RIGHT = 14
const AXIS_H = 26
const BAND_H = 18
const BAND_GAP = 8
const HEIGHT = AXIS_H + 3 * BAND_H + 2 * BAND_GAP + 22

interface Props {
  windows: { sun: Interval[]; earth: Interval[]; both: Interval[] }
  landingMs: number
  missionHours: number
  cursorHours: number
  playing: boolean
  reducedMotion: boolean
  title: string
  desc: string
  onCursor: (hours: number) => void
  onTogglePlay: () => void
}

export function Timeline({
  windows,
  landingMs,
  missionHours,
  cursorHours,
  playing,
  reducedMotion,
  title,
  desc,
  onCursor,
  onTogglePlay,
}: Props) {
  const { t } = useI18n()
  const [ref, width] = useWidth<HTMLDivElement>(520)
  const titleId = useId()
  const descId = useId()
  const track = useRef<HTMLDivElement>(null)

  const plotW = Math.max(40, width - LABEL_W - RIGHT)
  const max = Math.max(1, missionHours)
  const cursor = Math.min(cursorHours, max)
  const xOf = (hours: number) => LABEL_W + (hours / max) * plotW
  const hoursOf = (ms: number) => (ms - landingMs) / HOUR_MS

  const days = max / 24
  const step = dayTickStep(days, plotW)
  const ticks: number[] = []
  for (let d = 0; d <= days + 1e-9; d += step) ticks.push(d)

  const bands: [string, string, Interval[]][] = [
    [t('bandSun'), 'var(--sun)', windows.sun],
    [t('bandEarth'), 'var(--earth)', windows.earth],
    [t('bandBoth'), 'var(--both)', windows.both],
  ]

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onCursor(Math.round(f * max))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const jump: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -24,
      PageUp: 24,
    }
    let next: number | null = null
    if (Object.hasOwn(jump, e.key)) next = cursor + (jump[e.key] ?? 0)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    onCursor(Math.min(max, Math.max(0, next)))
  }

  const valueText = t('cursorValue', { h: Math.round(cursor), date: formatUtc(landingMs + cursor * HOUR_MS) })

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-outline"
          onClick={onTogglePlay}
          disabled={reducedMotion}
          aria-pressed={playing}
        >
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          {playing ? t('pause') : t('play')}
        </button>
        <p className="num text-caption text-label-2" aria-live="off">
          {valueText}
        </p>
        {reducedMotion && <p className="text-caption text-label-2">{t('playReducedMotion')}</p>}
      </div>
      <div ref={ref} className="relative w-full min-w-0">
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descId}`} className="block">
          <title id={titleId}>{title}</title>
          <desc id={descId}>{desc}</desc>
          {ticks.map((d) => (
            <g key={d}>
              <line x1={xOf(d * 24)} x2={xOf(d * 24)} y1={AXIS_H - 4} y2={HEIGHT - 16} stroke="var(--line)" strokeWidth={0.5} />
              <text x={xOf(d * 24)} y={16} textAnchor={d === 0 ? 'start' : 'middle'} fontSize={14} fill="var(--label-2)" className="num">
                {d}
              </text>
            </g>
          ))}
          <text x={0} y={16} fontSize={14} fill="var(--label-2)">
            {t('axisDays')}
          </text>
          {bands.map(([label, color, intervals], i) => {
            const y = AXIS_H + i * (BAND_H + BAND_GAP)
            return (
              <g key={label}>
                <text x={0} y={y + 14} fontSize={14} fontWeight={500} fill="var(--label)">
                  {label}
                </text>
                <rect x={LABEL_W} y={y} width={plotW} height={BAND_H} rx={4} fill="var(--bg-raised)" />
                {intervals.map(([a, b]) => {
                  const x0 = xOf(Math.max(0, hoursOf(Date.parse(a))))
                  const x1 = xOf(Math.min(max, hoursOf(Date.parse(b))))
                  return <rect key={a} x={x0} y={y} width={Math.max(1.5, x1 - x0)} height={BAND_H} rx={3} fill={color} />
                })}
              </g>
            )
          })}
          <line x1={xOf(cursor)} x2={xOf(cursor)} y1={AXIS_H - 4} y2={HEIGHT - 10} stroke="var(--label)" strokeWidth={2} />
          <circle cx={xOf(cursor)} cy={HEIGHT - 8} r={6} fill="var(--label)" stroke="var(--bg-elevated)" strokeWidth={2} />
        </svg>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={t('cursor')}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(cursor)}
          aria-valuetext={valueText}
          className="absolute top-0 bottom-0 cursor-ew-resize rounded-md"
          style={{ left: LABEL_W, right: RIGHT, touchAction: 'none' }}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            fromPointer(e)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e)
          }}
        />
      </div>
    </div>
  )
}
