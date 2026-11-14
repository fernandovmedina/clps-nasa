'use client'

import { useId, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { useI18n } from '@/control/i18n'
import { Field } from './CardParts'

function parse(raw: string, min: number, max: number): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  return n >= min && n <= max ? n : null
}

export function CustomCoords({ letter, onApply }: { letter: string; onApply: (lat: number, lon: number) => void }) {
  const { t } = useI18n()
  const latErrorId = useId()
  const lonErrorId = useId()
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const latValue = parse(lat, -90, 90)
  const lonValue = parse(lon, -180, 180)
  const latInvalid = submitted && latValue === null
  const lonInvalid = submitted && lonValue === null

  return (
    <form
      className="grid gap-3 rounded-[12px] border-[0.5px] border-line bg-elevated p-4"
      noValidate
      aria-labelledby="custom-title"
      data-testid="custom-form"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (latValue !== null && lonValue !== null) onApply(Math.round(latValue * 1e4) / 1e4, Math.round(lonValue * 1e4) / 1e4)
      }}
    >
      <h3 id="custom-title" className="text-heading">
        {t('customTitle')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('latitude')}>
          {(id) => (
            <input
              id={id}
              className="field num"
              inputMode="decimal"
              autoComplete="off"
              value={lat}
              aria-invalid={latInvalid}
              aria-describedby={latInvalid ? latErrorId : undefined}
              onChange={(e) => setLat(e.target.value)}
              data-testid="custom-lat"
            />
          )}
        </Field>
        <Field label={t('longitude')}>
          {(id) => (
            <input
              id={id}
              className="field num"
              inputMode="decimal"
              autoComplete="off"
              value={lon}
              aria-invalid={lonInvalid}
              aria-describedby={lonInvalid ? lonErrorId : undefined}
              onChange={(e) => setLon(e.target.value)}
              data-testid="custom-lon"
            />
          )}
        </Field>
      </div>
      {(latInvalid || lonInvalid) && (
        <div role="alert">
          <ul className="grid gap-1 text-caption text-bad">
            {latInvalid && (
              <li id={latErrorId} className="flex items-center gap-2">
                <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
                {t('latitudeError')}
              </li>
            )}
            {lonInvalid && (
              <li id={lonErrorId} className="flex items-center gap-2">
                <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
                {t('longitudeError')}
              </li>
            )}
          </ul>
        </div>
      )}
      <button type="submit" className="btn btn-outline" data-testid="custom-apply">
        {t('customApply', { letter })}
      </button>
    </form>
  )
}
