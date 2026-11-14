'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { I18nProvider, detectLang, useI18n, type Lang } from '@/control/i18n'
import { applyTheme, readPref, readTheme, writePref, type Theme } from '@/control/lib/prefs'
import { reducer, type Action } from '@/control/lib/reducer'
import { decodeState, encodeState } from '@/control/lib/stateUrl'
import { loadSites } from '@/control/lib/data'
import { MAX_SCENARIOS, SCENARIO_LETTERS, defaultState, type AppState, type SiteRef } from '@/control/lib/types'
import { useAsync } from '@/control/lib/useAsync'
import { useReducedMotion } from '@/control/lib/useReducedMotion'
import { useScenarioEntries } from '@/control/lib/useScenarioEntries'
import { Calendar } from './Calendar'
import { Catalog } from './Catalog'
import { CatalogDialog } from './CatalogDialog'
import { CustomCoords } from './CustomCoords'
import { ErrorBoundary } from './ErrorBoundary'
import { MissionBar } from './MissionBar'
import { Report } from './Report'
import { ScenarioCard } from './ScenarioCard'
import { TopBar } from './TopBar'

const GRID_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 lg:grid-cols-2',
  3: 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
  4: 'grid-cols-1 lg:grid-cols-2',
}

function Shell({
  state,
  dispatch,
  theme,
  lang,
  onToggleTheme,
  onChangeLang,
  ready,
}: {
  state: AppState
  dispatch: (a: Action) => void
  theme: Theme
  lang: Lang
  onToggleTheme: () => void
  onChangeLang: (lang: Lang) => void
  ready: boolean
}) {
  const { t } = useI18n()
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [playing, setPlaying] = useState(false)
  const reducedMotion = useReducedMotion()
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [sites, retrySites] = useAsync('sites', () => loadSites().then((file) => file.sites))

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setScrolled(!(entry?.isIntersecting ?? true)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const advance = useCallback((max: number) => dispatch({ type: 'advance', max }), [dispatch])
  const togglePlay = useCallback(() => setPlaying((p) => !p), [])
  const count = state.scenarios.length
  const selected = state.scenarios[state.selected] ?? state.scenarios[0]
  const letter = SCENARIO_LETTERS[state.selected] ?? '1'

  const chooseSite = (index: number) => {
    dispatch({ type: 'select', index })
    const sidebar = document.querySelector<HTMLInputElement>('aside input[type="search"]')
    if (sidebar && sidebar.offsetParent !== null) sidebar.focus()
    else setCatalogOpen(true)
  }

  const pickSite = (id: string) => {
    dispatch({ type: 'setSite', index: state.selected, site: { kind: 'catalog', id } })
    setCatalogOpen(false)
  }

  const addScenario = () => {
    const used = new Set(state.scenarios.flatMap((s) => (s.site.kind === 'catalog' ? [s.site.id] : [])))
    const free = sites.status === 'ready' ? sites.value.find((s) => !used.has(s.id)) : undefined
    const site: SiteRef = free ? { kind: 'catalog', id: free.id } : (selected?.site ?? { kind: 'catalog', id: 'malapert-a' })
    dispatch({ type: 'add', site })
  }

  const selectedSite = selected?.site
  const currentId = selectedSite?.kind === 'catalog' ? selectedSite.id : null
  const siteName =
    selectedSite?.kind === 'catalog' && sites.status === 'ready'
      ? (sites.value.find((s) => s.id === selectedSite.id)?.name ?? '')
      : t('customName')

  const applyCustom = (lat: number, lon: number) => {
    dispatch({ type: 'setSite', index: state.selected, site: { kind: 'custom', lat, lon } })
    setCatalogOpen(false)
  }

  const reportState = useScenarioEntries(state.scenarios, state.delayDays, t('customName'))

  const catalog = (heading?: React.ReactNode) => (
    <Catalog
      sites={sites}
      currentId={currentId}
      letter={letter}
      onPick={pickSite}
      onRetry={retrySites}
      heading={heading}
      custom={<CustomCoords letter={letter} onApply={applyCustom} />}
    />
  )

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="absolute top-0 h-px w-px" />
      <TopBar
        theme={theme}
        lang={lang}
        onToggleTheme={onToggleTheme}
        onChangeLang={onChangeLang}
        scrolled={scrolled}
        onOpenCatalog={() => setCatalogOpen(true)}
      />
      <CatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        {(heading) => catalog(heading)}
      </CatalogDialog>
      <main className="page-margin mx-auto max-w-[1440px] pt-8 pb-16" aria-busy={!ready}>
        <h1 className="sr-only print:not-sr-only print:text-title">
          {t('appName')} · {t('appSubtitle')}
        </h1>
        {!ready ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="skeleton h-[560px]" aria-hidden="true" />
            <div className="skeleton h-[560px]" aria-hidden="true" />
          </div>
        ) : (
          <div className="grid items-start gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="no-print catalog-aside hidden pr-1 xl:block" aria-label={t('catalogTitle')}>
              {catalog()}
            </aside>
            <div className="grid min-w-0 grid-cols-1 gap-8">
              <div className="no-print">
                <MissionBar
                  delayDays={state.delayDays}
                  scenarioCount={count}
                  onAddDelay={(days) => dispatch({ type: 'addDelay', days })}
                  onSetDelay={(days) => dispatch({ type: 'setDelay', days })}
                  onAdd={addScenario}
                />
              </div>
              <div className={`no-print grid items-start gap-6 ${GRID_COLUMNS[count] ?? ''}`}>
                {state.scenarios.map((scenario, i) => (
                  <ErrorBoundary key={i} resetKey={JSON.stringify(scenario)}>
                    <ScenarioCard
                      index={i}
                      scenario={scenario}
                      selected={state.selected === i}
                      multiple={count > 1}
                      canDuplicate={count < MAX_SCENARIOS}
                      delayDays={state.delayDays}
                      cursorHours={state.cursorHours}
                      playing={playing}
                      reducedMotion={reducedMotion}
                      onSelect={() => dispatch({ type: 'select', index: i })}
                      onLanding={(landing) => dispatch({ type: 'setLanding', index: i, landing })}
                      onDuration={(days) => dispatch({ type: 'setDuration', index: i, days })}
                      onDuplicate={() => dispatch({ type: 'duplicate', index: i })}
                      onRemove={() => dispatch({ type: 'remove', index: i })}
                      onCursor={(hours) => dispatch({ type: 'setCursor', hours })}
                      onAdvance={advance}
                      onTogglePlay={togglePlay}
                      onChooseSite={() => chooseSite(i)}
                    />
                  </ErrorBoundary>
                ))}
              </div>
              {selected && (
                <div className="no-print">
                  <Calendar
                    scenario={selected}
                    siteName={siteName}
                    delayDays={state.delayDays}
                    onPick={(landing) => dispatch({ type: 'setLanding', index: state.selected, landing })}
                  />
                </div>
              )}
              <ErrorBoundary resetKey={`${state.delayDays}|${JSON.stringify(state.scenarios)}`}>
                <Report
                  entries={reportState.entries}
                  pending={reportState.pending}
                  delayDays={state.delayDays}
                  selectedLetter={letter}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, defaultState)
  const [ready, setReady] = useState(false)
  const [lang, setLang] = useState<Lang>('es')
  const [theme, setTheme] = useState<Theme>('light')

  /* eslint-disable react-hooks/set-state-in-effect -- client-only state is read after the static render */
  useEffect(() => {
    dispatch({ type: 'hydrate', state: decodeState(window.location.search) })
    setLang(detectLang(readPref('lang'), navigator.language))
    setTheme(readTheme())
    setReady(true)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return
    const query = encodeState(state)
    window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`)
  }, [state, ready])

  useEffect(() => {
    if (ready) document.documentElement.lang = lang
  }, [lang, ready])

  const changeLang = (next: Lang) => {
    writePref('lang', next)
    setLang(next)
  }

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    writePref('theme', next)
    setTheme(next)
  }

  return (
    <I18nProvider lang={lang}>
      <Shell
        state={state}
        dispatch={dispatch}
        theme={theme}
        lang={lang}
        onToggleTheme={toggleTheme}
        onChangeLang={changeLang}
        ready={ready}
      />
    </I18nProvider>
  )
}
