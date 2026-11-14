'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Rocket, TriangleAlert } from 'lucide-react'
import { useI18n } from '@/control/i18n'
import { formatNumber } from '@/control/lib/format'
import { bothHours, buildMarkdown, pickRecommended, riskText, risksFor, type ReportEntry } from '@/control/lib/report'
import { formatUtc } from '@/control/lib/time'
import { StatusPill } from './CardParts'

type CopyState = 'idle' | 'copied' | 'failed'

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

export function Report({
  entries,
  pending,
  delayDays,
  selectedLetter,
}: {
  entries: ReportEntry[]
  pending: boolean
  delayDays: number
  selectedLetter?: string
}) {
  const { t, locale } = useI18n()
  const [copy, setCopy] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)
  const recommended = pickRecommended(entries)
  const launch = entries.find((e) => e.letter === selectedLetter)?.launchHref
  const hours = (n: number) => formatNumber(locale, n)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onCopy = async () => {
    const ok = await writeClipboard(buildMarkdown(entries, recommended, delayDays, t, locale))
    setCopy(ok ? 'copied' : 'failed')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopy('idle'), 4000)
  }

  return (
    <section className="card grid min-w-0 grid-cols-1 gap-6 p-6" aria-labelledby="report-title" data-testid="report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="report-title" className="text-title">
            {t('report')}
          </h2>
          {delayDays !== 0 && <p className="num text-body text-label-2">{t('reportDelay', { n: delayDays })}</p>}
        </div>
        <div className="no-print grid justify-items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {launch && (
              <a href={launch} className="btn btn-outline" data-testid="launch-link-report">
                <Rocket size={18} aria-hidden="true" />
                {t('launchMission')}
              </a>
            )}
            <button type="button" className="btn btn-solid" onClick={onCopy} disabled={entries.length === 0}>
              {copy === 'copied' ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {t('copySummary')}
            </button>
          </div>
          <p className="text-caption text-label-2" role="status" aria-live="polite">
            {copy === 'copied' ? t('copied') : copy === 'failed' ? t('copyFailed') : ''}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        pending ? (
          <div className="skeleton h-40" role="status" aria-label={t('loading')} />
        ) : (
          <p className="text-body text-label-2">{t('reportNoScenarios')}</p>
        )
      ) : (
        <>
          {recommended && (
            <div className="grid gap-3 rounded-[12px] bg-raised p-5" data-testid="recommended">
              <p className="text-label text-label-2">{t('recommendedScenario')}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="grid h-11 w-11 place-items-center rounded-control border-[0.5px] border-line-strong bg-elevated text-heading">
                  {recommended.letter}
                </span>
                <div className="grid min-w-0 gap-1">
                  <p className="text-lead break-words">{recommended.name}</p>
                  <p className="num text-body text-label-2">{formatUtc(recommended.landingMs)}</p>
                </div>
                <StatusPill status={recommended.response.status} />
                <p className="num text-title">{t('scoreValue', { n: recommended.response.score })}</p>
              </div>
              <p className="text-caption text-label-2">{t('recommendedReason', { score: recommended.response.score })}</p>
            </div>
          )}

          <div className="hidden md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t('compareTable')}</caption>
              <thead>
                <tr className="border-b-[0.5px] border-line-strong text-label text-label-2">
                  {(['colScenario', 'colSite', 'colLanding', 'colStatus', 'colScore', 'colSun', 'colEarth', 'colBoth'] as const).map(
                    (key, i) => (
                      <th key={key} scope="col" className={`px-2 py-2 font-medium ${i >= 4 ? 'text-right' : ''}`}>
                        {t(key)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.letter} className="border-b-[0.5px] border-line align-middle">
                    <th scope="row" className="px-2 py-3 font-semibold">
                      {e.letter}
                      {e === recommended && (
                        <>
                          <Check size={16} aria-hidden="true" className="ml-1 inline" />
                          <span className="sr-only"> {t('recommendedScenario')}</span>
                        </>
                      )}
                    </th>
                    <td className="px-2 py-3">{e.name}</td>
                    <td className="num px-2 py-3">{formatUtc(e.landingMs)}</td>
                    <td className="px-2 py-3">
                      <StatusPill status={e.response.status} size="sm" />
                    </td>
                    <td className="num px-2 py-3 text-right font-semibold">{e.response.score}</td>
                    <td className="num px-2 py-3 text-right">{hours(e.response.sun.hours_visible)}</td>
                    <td className="num px-2 py-3 text-right">{hours(e.response.earth.hours_visible)}</td>
                    <td className="num px-2 py-3 text-right">{hours(bothHours(e))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden" aria-label={t('compareTable')}>
            {entries.map((e) => (
              <li key={e.letter} className="grid gap-2 rounded-control bg-raised p-4">
                <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
                  {e.letter} · {e.name}
                  {e === recommended && (
                    <>
                      <Check size={16} aria-hidden="true" />
                      <span className="sr-only"> {t('recommendedScenario')}</span>
                    </>
                  )}
                </p>
                <p className="num text-caption text-label-2">{formatUtc(e.landingMs)}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill status={e.response.status} size="sm" />
                  <span className="num text-body font-semibold">{t('scoreValue', { n: e.response.score })}</span>
                </div>
                <p className="num text-caption text-label-2">
                  {t('colSun')} {hours(e.response.sun.hours_visible)} · {t('colEarth')} {hours(e.response.earth.hours_visible)} ·{' '}
                  {t('colBoth')} {hours(bothHours(e))}
                </p>
              </li>
            ))}
          </ul>

          <div className="grid gap-3">
            <h3 className="text-label text-label-2">{t('risks')}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {entries.map((e) => {
                const risks = risksFor(e)
                return (
                  <div key={e.letter} className="grid content-start gap-2" data-testid={`risks-${e.letter}`}>
                    <p className="text-body font-semibold">
                      {e.letter} · {e.name}
                    </p>
                    {risks.length === 0 ? (
                      <p className="flex items-center gap-2 text-body text-label-2">
                        <Check size={18} aria-hidden="true" className="shrink-0" />
                        {t('noRisks')}
                      </p>
                    ) : (
                      <ul className="grid gap-2">
                        {risks.map((risk) => (
                          <li key={risk.id} className="flex items-start gap-2 text-body">
                            <TriangleAlert size={18} aria-hidden="true" className="mt-1 shrink-0" style={{ color: 'var(--marginal)' }} />
                            {riskText(t, locale, risk)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
