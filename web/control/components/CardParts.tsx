'use client'

import { useId, useState, type ReactNode } from 'react'
import { ArrowRight, CircleCheck, CircleX, Earth, Minus, Sun, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import type { ScenarioStatus } from '@touchdown/core'
import { useI18n, type Key } from '@/control/i18n'
import { formatNumber } from '@/control/lib/format'
import { maskedBy, type BodyAt } from '@/control/lib/scenario'

const STATUS: Record<ScenarioStatus, { key: Key; fill: string; mark: string; Icon: typeof CircleCheck }> = {
  viable: { key: 'statusViable', fill: 'var(--viable-bg)', mark: 'var(--viable)', Icon: CircleCheck },
  marginal: { key: 'statusMarginal', fill: 'var(--marginal-bg)', mark: 'var(--marginal)', Icon: TriangleAlert },
  not_viable: { key: 'statusNotViable', fill: 'var(--bad-bg)', mark: 'var(--idle)', Icon: CircleX },
}

export function statusColor(status: ScenarioStatus): string {
  return STATUS[status].mark
}

export function statusKey(status: ScenarioStatus): Key {
  return STATUS[status].key
}

export function StatusPill({ status, size = 'lg' }: { status: ScenarioStatus; size?: 'sm' | 'lg' }) {
  const { t } = useI18n()
  const { key, fill, Icon } = STATUS[status]
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-2 rounded-full font-semibold text-on-status ${
        size === 'lg' ? 'min-h-8 px-3 text-[0.875rem]' : 'min-h-7 px-3 text-label'
      }`}
      style={{ background: fill }}
    >
      <Icon size={16} aria-hidden="true" />
      {t(key)}
    </span>
  )
}

// Fila compacta de lectura de un cuerpo (Sol o Tierra): misma estructura para los dos.
// Elevación y estado (visible, bajo el horizonte o tapada por el relieve) y el azimut en tinta 2.
export function BodyReading({
  kind,
  label,
  body,
}: {
  kind: 'sun' | 'earth'
  label: string
  body: BodyAt | undefined
}) {
  const { t, locale } = useI18n()
  const fmt = (n: number) => formatNumber(locale, n, 1)
  const masked = body ? maskedBy(body) : null
  const state = !body
    ? ''
    : masked
      ? t('maskedShort', { gap: fmt(masked.gap), horizon: fmt(masked.horizonEl) })
      : t(body.visible ? 'visible' : 'belowHorizon')
  const Icon = kind === 'sun' ? Sun : Earth
  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5"
      data-testid={`${kind}-row`}
      data-masked={masked ? 'true' : 'false'}
    >
      <Icon size={18} aria-hidden="true" className="row-span-3 mt-0.5" style={{ color: `var(--${kind})` }} />
      <p className="text-label text-label-2" data-testid={`${kind}-label`}>
        {label}
      </p>
      <p className="num text-body" data-testid={`${kind}-reading`}>
        <span data-testid={`${kind}-elevation`}>{body ? `${fmt(body.el)}°` : '–'}</span>
        {' · '}
        <span>{state}</span>
      </p>
      <p className="num text-caption text-label-2" data-testid={`${kind}-azimuth`}>
        {t('azimuthShort', { az: body ? fmt(body.az) : '–' })}
      </p>
    </li>
  )
}

export function MetricBar({
  label,
  value,
  fraction,
  color,
}: {
  label: string
  value: string
  fraction: number
  color: string
}) {
  const { t } = useI18n()
  const pct = Math.round(fraction * 100)
  return (
    <div className="grid content-start gap-2">
      <span className="text-label text-label-2">{label}</span>
      <span className="num text-heading whitespace-nowrap">{value}</span>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-raised" aria-hidden="true">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="num text-label font-normal text-label-2">{t('ofMission', { n: pct })}</span>
    </div>
  )
}

export function Delta({
  label,
  value,
  unit = '',
  prominent = false,
}: {
  label: string
  value: number
  unit?: string
  prominent?: boolean
}) {
  const { locale } = useI18n()
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±'
  const abs = Math.abs(value)
  const text = `${sign}${formatNumber(locale, abs, Number.isInteger(abs) ? 0 : 1)}${unit}`
  const Trend = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  return (
    <div className="grid content-between gap-1 rounded-control bg-raised px-3 py-2">
      <span className="text-label text-label-2">{label}</span>
      <span className={`num flex items-center gap-2 text-accent-text ${prominent ? 'text-figure' : 'text-heading'}`}>
        <Trend size={prominent ? 28 : 18} aria-hidden="true" className="shrink-0" />
        {text}
      </span>
    </div>
  )
}

export function StatusChange({ label, from, to }: { label: string; from: ScenarioStatus; to: ScenarioStatus }) {
  return (
    <div className="grid content-between gap-2 rounded-control bg-raised px-3 py-2">
      <span className="text-label text-label-2">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status={from} size="sm" />
        <ArrowRight size={18} aria-hidden="true" className="shrink-0" />
        <span className="sr-only"> → </span>
        <StatusPill status={to} size="sm" />
      </span>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-label text-label-2">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export function NumberField({
  id,
  value,
  min,
  max,
  onCommit,
}: {
  id: string
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && !(/^\d+$/.test(draft) && Number(draft) >= min && Number(draft) <= max)
  return (
    <input
      id={id}
      className="field num"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={draft ?? String(value)}
      aria-invalid={invalid}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        if (/^\d+$/.test(next) && Number(next) >= min && Number(next) <= max) onCommit(Number(next))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
