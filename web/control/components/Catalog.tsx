'use client'

import { useId, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { Site } from '@touchdown/core'
import { useI18n, type Key } from '@/control/i18n'
import { formatNumber } from '@/control/lib/format'
import type { AsyncState } from '@/control/lib/useAsync'

const REGIONS: { id: Site['region']; key: Key }[] = [
  { id: 'south-pole', key: 'regionSouthPole' },
  { id: 'mid-latitude', key: 'regionMidLatitude' },
  { id: 'equatorial', key: 'regionEquatorial' },
  { id: 'far-side', key: 'regionFarSide' },
]

interface Props {
  sites: AsyncState<Site[]>
  currentId: string | null
  letter: string
  onPick: (id: string) => void
  onRetry: () => void
  custom?: React.ReactNode
  heading?: React.ReactNode
}

export function Catalog({ sites, currentId, letter, onPick, onRetry, custom, heading }: Props) {
  const { t, locale } = useI18n()
  const searchId = useId()
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    if (sites.status !== 'ready') return []
    const q = query.trim().toLowerCase()
    return REGIONS.map((region) => ({
      ...region,
      items: sites.value.filter((s) => {
        if (s.region !== region.id) return false
        if (q === '') return true
        const haystack = `${s.name} ${s.program} ${s.id} ${t(region.key)}`.toLowerCase()
        return haystack.includes(q)
      }),
    })).filter((g) => g.items.length > 0)
  }, [sites, query, t])

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        {heading ?? <h2 className="text-heading">{t('catalogTitle')}</h2>}
        <p className="text-caption text-label-2">{t('appliesTo', { letter })}</p>
      </div>
      <div className="grid gap-1">
        <label htmlFor={searchId} className="text-caption text-label-2">
          {t('searchLabel')}
        </label>
        <div className="relative">
          <Search size={20} aria-hidden="true" className="pointer-events-none absolute top-3 left-3 text-label-2" />
          <input
            id={searchId}
            type="search"
            className="field pl-10"
            placeholder={t('searchPlaceholder')}
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {sites.status === 'loading' && (
        <div className="grid gap-2" role="status" aria-label={t('loading')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      )}
      {sites.status === 'error' && (
        <div role="alert" className="grid gap-3 rounded-control border border-line-strong p-4">
          <p>{t('catalogLoadError')}</p>
          <button type="button" className="btn btn-outline justify-self-start" onClick={onRetry}>
            {t('retry')}
          </button>
        </div>
      )}
      {sites.status === 'ready' && groups.length === 0 && (
        <p className="rounded-control border border-line px-4 py-3 text-body text-label-2" role="status">
          {t('noResults', { q: query.trim() })}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.id} className="grid gap-1.5" aria-label={t(group.key)}>
          <h3 className="text-eyebrow text-label-2">{t(group.key)}</h3>
          <ul className="grid gap-1">
            {group.items.map((site) => {
              const current = site.id === currentId
              return (
                <li key={site.id}>
                  <button
                    type="button"
                    className="btn btn-quiet h-auto min-h-11 w-full justify-between gap-3 px-3 py-1.5 text-left"
                    aria-current={current ? 'true' : undefined}
                    data-site={site.id}
                    onClick={() => onPick(site.id)}
                  >
                    <span className="grid min-w-0 gap-1">
                      <span className="text-body leading-5 font-medium whitespace-normal">{site.name}</span>
                      <span className="num text-caption font-normal whitespace-normal text-label-2">
                        {site.program} · {site.approx ? '≈ ' : ''}
                        {formatNumber(locale, site.lat, 2)}°, {formatNumber(locale, site.lon, 2)}°
                      </span>
                    </span>
                    {current && <Check size={18} aria-hidden="true" className="shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {custom}
    </div>
  )
}
