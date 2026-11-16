'use client'

import * as Slider from '@radix-ui/react-slider'
import { Plus } from 'lucide-react'
import { useI18n } from '@/control/i18n'
import { DELAY_STEPS, MAX_DELAY_DAYS, MAX_SCENARIOS } from '@/control/lib/types'

interface Props {
  delayDays: number
  scenarioCount: number
  onAddDelay: (days: number) => void
  onSetDelay: (days: number) => void
  onAdd: () => void
}

export function MissionBar({ delayDays, scenarioCount, onAddDelay, onSetDelay, onAdd }: Props) {
  const { t } = useI18n()
  const atMax = scenarioCount >= MAX_SCENARIOS
  const valueText = delayDays === 0 ? t('delayNone') : `+${t('delayValue', { n: delayDays })}`

  return (
    <section
      aria-label={t('missionBar')}
      className="card grid gap-6 p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
    >
      <div className="grid gap-1">
        <p className="text-caption text-label-2" id="delay-label">
          {t('delay')}
        </p>
        <p className="num text-figure text-accent-text" data-testid="delay-value" aria-live="polite">
          {valueText}
        </p>
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby="delay-label">
          {DELAY_STEPS.map((n) => (
            <button
              key={n}
              type="button"
              className="btn btn-outline num px-3"
              aria-label={n < 0 ? t('delayBackLabel', { n: -n }) : t('delayStepLabel', { n })}
              disabled={n < 0 && delayDays === 0}
              onClick={() => onAddDelay(n)}
            >
              {n < 0 ? `−${-n}` : `+${n}`}
            </button>
          ))}
          <button type="button" className="btn btn-quiet px-3" disabled={delayDays === 0} onClick={() => onSetDelay(0)}>
            {t('delayReset')}
          </button>
        </div>
        <Slider.Root
          className="relative flex h-11 w-full touch-none items-center select-none"
          min={0}
          max={MAX_DELAY_DAYS}
          step={1}
          value={[delayDays]}
          onValueChange={([v]) => onSetDelay(v ?? 0)}
        >
          <Slider.Track className="relative h-2 grow rounded-full bg-line-strong">
            <Slider.Range className="absolute h-full rounded-full bg-accent" />
          </Slider.Track>
          <Slider.Thumb
            aria-label={t('delaySlider')}
            aria-valuetext={valueText}
            className="relative block h-6 w-6 rounded-full border-2 border-control bg-accent outline-offset-2 after:absolute after:-inset-3 after:content-[''] active:opacity-80"
          />
        </Slider.Root>
      </div>
      <div className="grid justify-items-start gap-1 lg:justify-items-end">
        <button type="button" className="btn btn-outline" disabled={atMax} onClick={onAdd}>
          <Plus size={18} aria-hidden="true" />
          {t('addScenario')}
        </button>
        {atMax && <p className="text-caption text-label-2">{t('maxScenarios')}</p>}
      </div>
    </section>
  )
}
