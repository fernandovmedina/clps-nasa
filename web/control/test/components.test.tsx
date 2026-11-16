import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ScenarioResponse } from '@touchdown/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomCoords } from '@/control/components/CustomCoords'
import { Report } from '@/control/components/Report'
import { StatusPill } from '@/control/components/CardParts'
import { I18nProvider } from '@/control/i18n'
import type { ReportEntry } from '@/control/lib/report'

afterEach(cleanup)

const wrap = (ui: React.ReactElement, lang: 'es' | 'en' = 'es') => render(<I18nProvider lang={lang}>{ui}</I18nProvider>)

describe('StatusPill', () => {
  it.each([
    ['viable', 'Viable'],
    ['marginal', 'Marginal'],
    ['not_viable', 'No viable'],
  ] as const)('shows %s with text and an icon, never colour alone', (status, label) => {
    const { container } = wrap(<StatusPill status={status} />)
    expect(screen.getByText(label)).toBeTruthy()
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('CustomCoords', () => {
  const fill = (lat: string, lon: string) => {
    fireEvent.change(screen.getByTestId('custom-lat'), { target: { value: lat } })
    fireEvent.change(screen.getByTestId('custom-lon'), { target: { value: lon } })
    fireEvent.click(screen.getByTestId('custom-apply'))
  }

  it('applies valid coordinates, accepting a decimal comma', () => {
    const onApply = vi.fn()
    wrap(<CustomCoords letter="A" onApply={onApply} />)
    fill('-89,9', '0')
    expect(onApply).toHaveBeenCalledWith(-89.9, 0)
  })

  it('explains out-of-range values in text and does not apply them', () => {
    const onApply = vi.fn()
    wrap(<CustomCoords letter="A" onApply={onApply} />)
    fill('-91', '181')
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText('Latitud entre −90 y 90')).toBeTruthy()
    expect(screen.getByText('Longitud entre −180 y 180')).toBeTruthy()
    expect(screen.getByTestId('custom-lat').getAttribute('aria-invalid')).toBe('true')
  })

  it('rejects text that is not a number', () => {
    const onApply = vi.fn()
    wrap(<CustomCoords letter="B" onApply={onApply} />, 'en')
    fill('north', '10')
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText('Latitude between −90 and 90')).toBeTruthy()
  })
})

function entry(letter: string, score: number, status: ScenarioResponse['status'], extra: Partial<ReportEntry> = {}): ReportEntry {
  const body = { az_now: 0, elev_now: 5, visible_now: true, hours_visible: 100, max_elev: 3, min_elev: 0, avg_elev: 2, next_set: null, next_rise: null }
  return {
    letter,
    name: `Sitio ${letter}`,
    landingMs: Date.parse('2027-01-10T00:00:00Z'),
    durationDays: 14,
    missionHours: 336,
    approx: false,
    horizonSource: 'lola',
    response: {
      site_id: letter,
      site_name: letter,
      landing: '2027-01-10T00:00:00Z',
      duration_days: 14,
      horizon_source: 'lola',
      ephemeris_source: 'x',
      truncated: false,
      sun: body,
      earth: body,
      windows: { sun: [], earth: [], both: [] },
      fractions: { sun: 0.3, earth: 0.3, both: 0.2 },
      metrics: { energy: 0.3, comms: 0.3, ops: 0.2, continuity: 0.5, longest_dark_h: 100 },
      score,
      status,
    },
    ...extra,
  }
}

describe('Report', () => {
  it('names the recommended scenario and lists the risks of each scenario', () => {
    wrap(<Report entries={[entry('A', 40, 'marginal'), entry('B', 80, 'viable', { approx: true })]} pending={false} delayDays={21} />)
    const recommended = screen.getByTestId('recommended')
    expect(recommended.textContent).toContain('Sitio B')
    expect(recommended.textContent).toContain('80 / 100')
    expect(screen.getByTestId('risks-B').textContent).toContain('Coordenadas aproximadas.')
    expect(screen.getByTestId('risks-A').textContent).toContain('Tierra nunca es visible')
    expect(screen.getByText('Retraso aplicado: 21 días.')).toBeTruthy()
  })

  it('copies a Markdown summary to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    wrap(<Report entries={[entry('A', 70, 'viable')]} pending={false} delayDays={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar resumen' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toContain('# Resumen de misión')
    await vi.waitFor(() => expect(screen.getByText('Resumen copiado')).toBeTruthy())
  })

  it('launches the recommended scenario, not the selected one, and says which', () => {
    const entries = [
      entry('A', 40, 'marginal', { name: 'Malapert A (IM-1 Odysseus)', launchHref: '/?landing=2027-01-10T00:00:00Z&site=malapert-a' }),
      entry('B', 80, 'viable', { name: 'Mons Mouton (IM-2 Athena)', launchHref: '/?landing=2027-01-10T00:00:00Z&site=mons-mouton' }),
    ]
    const { rerender } = wrap(<Report entries={entries} pending={false} delayDays={0} />)
    const link = screen.getByTestId('launch-link-report')
    expect(link.textContent).toBe('Lanzar B · Mons Mouton')
    expect(link.getAttribute('href')).toBe('/?landing=2027-01-10T00:00:00Z&site=mons-mouton')
    rerender(
      <I18nProvider lang="en">
        <Report entries={entries} pending={false} delayDays={0} />
      </I18nProvider>,
    )
    expect(screen.getByTestId('launch-link-report').textContent).toBe('Launch B · Mons Mouton')
  })

  it('follows the recommendation when A is the better scenario', () => {
    const entries = [
      entry('A', 90, 'viable', { launchHref: '/?landing=2027-01-10T00:00:00Z&site=malapert-a' }),
      entry('B', 50, 'marginal', { launchHref: '/?landing=2027-01-10T00:00:00Z&site=mons-mouton' }),
    ]
    wrap(<Report entries={entries} pending={false} delayDays={0} />)
    expect(screen.getByTestId('launch-link-report').getAttribute('href')).toBe('/?landing=2027-01-10T00:00:00Z&site=malapert-a')
  })

  it('hides the launch link when the recommended scenario has no link', () => {
    wrap(
      <Report
        entries={[entry('A', 40, 'marginal', { launchHref: '/?landing=2027-01-10T00:00:00Z&site=malapert-a' }), entry('B', 80, 'viable')]}
        pending={false}
        delayDays={0}
      />,
    )
    expect(screen.queryByTestId('launch-link-report')).toBeNull()
  })

  it('shows a skeleton while scenarios load and an empty message afterwards', () => {
    const { rerender } = wrap(<Report entries={[]} pending delayDays={0} />)
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeTruthy()
    rerender(
      <I18nProvider lang="es">
        <Report entries={[]} pending={false} delayDays={0} />
      </I18nProvider>,
    )
    expect(screen.getByText('Sin escenarios calculados.')).toBeTruthy()
  })
})
