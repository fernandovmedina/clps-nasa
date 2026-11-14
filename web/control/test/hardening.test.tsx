import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/control/components/ErrorBoundary'
import { ScenarioCard } from '@/control/components/ScenarioCard'
import { I18nProvider } from '@/control/i18n'
import { useScenarioEntries } from '@/control/lib/useScenarioEntries'
import type { Scenario } from '@/control/lib/types'

const sitesFile = {
  generated_at: '2026-11-14T00:00:00Z',
  ephemeris_range: { start: '2026-11-01T00:00:00Z', end: '2028-01-01T00:00:00Z', step_minutes: 60 },
  sites: [
    {
      id: 'malapert-a',
      name: 'Malapert A',
      program: 'CLPS',
      region: 'south-pole',
      lat: -80.13,
      lon: 1.44,
      elevation_m: 2593,
      has_terrain: true,
      horizon_source: 'lola',
      ephemeris_source: 'jpl-horizons',
    },
  ],
}

const fetched: string[] = []

beforeEach(() => {
  fetched.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      fetched.push(path)
      if (path === '/data/sites.json') return new Response(JSON.stringify(sitesFile))
      return new Response('missing', { status: 404 })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const landing = '2027-01-10T00:00:00Z'
const scenario = (id: string): Scenario => ({ site: { kind: 'catalog', id }, landing, durationDays: 14 })

describe('useScenarioEntries with ids that exist on Object.prototype', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'])(
    'treats %s as an unknown site instead of a loaded one',
    async (id) => {
      const { result } = renderHook(() => useScenarioEntries([scenario(id)], 21, 'Custom'))
      await waitFor(() => expect(result.current.failed).toBe(true))
      expect(result.current.entries).toEqual([])
      expect(result.current.pending).toBe(false)
    },
  )

  it('does not request ephemeris files for a site that is not in the catalog', async () => {
    const { result } = renderHook(() => useScenarioEntries([scenario('constructor'), scenario('no-such-site')], 0, 'Custom'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(fetched.filter((p) => p !== '/data/sites.json')).toEqual([])
  })
})

describe('scenario card with an unknown site', () => {
  const noop = () => undefined
  const renderCard = (id: string, onChooseSite = vi.fn()) =>
    render(
      <I18nProvider lang="es">
        <ScenarioCard
          index={0}
          scenario={scenario(id)}
          selected
          multiple={false}
          canDuplicate
          delayDays={0}
          cursorHours={0}
          playing={false}
          reducedMotion={false}
          onSelect={noop}
          onLanding={noop}
          onDuration={noop}
          onDuplicate={noop}
          onRemove={noop}
          onCursor={noop}
          onAdvance={noop}
          onTogglePlay={noop}
          onChooseSite={onChooseSite}
        />
      </I18nProvider>,
    )

  it.each(['constructor', 'no-such-site'])('shows the unknown-site state for %s and offers to choose another', async (id) => {
    const onChooseSite = vi.fn()
    renderCard(id, onChooseSite)
    await screen.findByText('Sitio desconocido.')
    expect(screen.queryByTestId('launch-link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir otro sitio' }))
    expect(onChooseSite).toHaveBeenCalledTimes(1)
  })

  it('shows the unknown-site state for custom coordinates outside the valid range', async () => {
    render(
      <I18nProvider lang="es">
        <ScenarioCard
          index={0}
          scenario={{ site: { kind: 'custom', lat: 123, lon: 0 }, landing, durationDays: 14 }}
          selected
          multiple={false}
          canDuplicate
          delayDays={0}
          cursorHours={0}
          playing={false}
          reducedMotion={false}
          onSelect={noop}
          onLanding={noop}
          onDuration={noop}
          onDuplicate={noop}
          onRemove={noop}
          onCursor={noop}
          onAdvance={noop}
          onTogglePlay={noop}
          onChooseSite={noop}
        />
      </I18nProvider>,
    )
    await screen.findByText('Sitio desconocido.')
  })
})

describe('error boundary', () => {
  function Boom(): React.ReactElement {
    throw new Error('boom')
  }

  it('contains a crashing child and keeps its siblings alive', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <I18nProvider lang="es">
        <ErrorBoundary resetKey="a">
          <Boom />
        </ErrorBoundary>
        <p>hermano</p>
      </I18nProvider>,
    )
    expect(screen.getByRole('alert').textContent).toContain('No se pudo mostrar')
    expect(screen.getByText('hermano')).toBeTruthy()
    spy.mockRestore()
  })

  it('recovers when the reset key changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let crash = true
    function Maybe() {
      if (crash) throw new Error('boom')
      return <p>vivo</p>
    }
    const ui = (key: string) => (
      <I18nProvider lang="es">
        <ErrorBoundary resetKey={key}>
          <Maybe />
        </ErrorBoundary>
      </I18nProvider>
    )
    const { rerender } = render(ui('a'))
    expect(screen.getByRole('alert')).toBeTruthy()
    crash = false
    act(() => rerender(ui('b')))
    expect(screen.getByText('vivo')).toBeTruthy()
    spy.mockRestore()
  })
})
