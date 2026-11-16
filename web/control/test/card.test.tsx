import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScenarioCard } from '@/control/components/ScenarioCard'
import { I18nProvider } from '@/control/i18n'
import type { Scenario } from '@/control/lib/types'
import { fetchPublic } from './realData'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(fetchPublic))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const noop = () => undefined
const scenario = (id: string, landing: string, durationDays = 14): Scenario => ({ site: { kind: 'catalog', id }, landing, durationDays })

function card(scenarioValue: Scenario, selected: boolean, lang: 'es' | 'en' = 'es') {
  return render(
    <I18nProvider lang={lang}>
      <ScenarioCard
        index={0}
        scenario={scenarioValue}
        selected={selected}
        multiple
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
}

describe('scenario card, A and B share one structure', () => {
  it.each([true, false])('offers the launch button whether the card is selected (%s) or not', async (selected) => {
    card(scenario('malapert-a', '2027-01-10T00:00:00Z'), selected)
    const link = await screen.findByTestId('launch-link')
    expect(link.getAttribute('href')).toBe('/?landing=2027-01-10T00:00:00Z&site=malapert-a')
  })

  it('lays out status and score the same way for a viable and a not-viable scenario', async () => {
    const shape = (el: HTMLElement) => ({
      block: el.className,
      children: [...el.children].map((c) => `${c.tagName}.${c.className}`),
    })
    const first = card(scenario('malapert-a', '2027-01-10T00:00:00Z'), true)
    const a = shape(await screen.findByTestId('status-score'))
    const statusA = first.container.querySelector('[data-status]')!.getAttribute('data-status')
    first.unmount()
    const second = card(scenario('mons-mouton', '2027-01-10T00:00:00Z'), false)
    const b = shape(await screen.findByTestId('status-score'))
    const statusB = second.container.querySelector('[data-status]')!.getAttribute('data-status')
    expect(statusA).not.toBe(statusB)
    expect(a).toEqual(b)
  })

  it('never lets the status block wrap onto two lines', async () => {
    card(scenario('malapert-a', '2027-01-10T00:00:00Z'), true)
    const block = await screen.findByTestId('status-score')
    expect(block.className).not.toMatch(/flex-wrap/)
    expect(block.className).toMatch(/flex-nowrap|grid-flow-col|grid-cols-/)
  })
})

describe('scenario card, Sun and Earth events relative to the mission', () => {
  const landing = '2027-01-10T00:00:00Z'

  it('says the next Earthset falls after a 14-day mission instead of counting down to it', async () => {
    card(scenario('mons-mouton', landing), true)
    // El Earthset llega a los 17 d 11 h: pasada la misión de 14 días.
    expect((await screen.findByTestId('earth-countdown')).textContent).toBe('Sin Earthset durante la misión (el siguiente, día 17)')
  })

  it('counts down to the same Earthset when the mission is long enough to include it', async () => {
    card(scenario('mons-mouton', landing, 30), true)
    expect((await screen.findByTestId('earth-countdown')).textContent).toBe('Earthset en 17 d 11 h')
  })

  it('does the same for the sunset', async () => {
    card(scenario('shackleton-ridge', landing), true)
    expect((await screen.findByTestId('sun-countdown')).textContent).toBe('Sin ocaso durante la misión (el siguiente, día 39)')
  })

  it('says there is no event in the data when none exists before the end of the ephemeris', async () => {
    card(scenario('malapert-a', landing), true)
    expect((await screen.findByTestId('earth-countdown')).textContent).toBe('Sin Earthset hasta el fin de los datos (2028-01-01)')
  })

  it('speaks English too', async () => {
    card(scenario('mons-mouton', landing), true, 'en')
    expect((await screen.findByTestId('earth-countdown')).textContent).toBe('No Earthset during the mission (the next one, day 17)')
  })
})

describe('scenario card, a body above 0° but under the LOLA horizon', () => {
  it('shows the elevation, the LOLA horizon at that azimuth and how much is missing for the Earth at nobile-rim-2', async () => {
    card(scenario('nobile-rim-2', '2027-01-10T00:00:00Z'), true)
    const masked = await screen.findByTestId('earth-masked')
    expect(masked.textContent).toBe('1.3° · horizonte LOLA 7.0° · tapada 5.7°')
  })

  it('says it in English too', async () => {
    card(scenario('nobile-rim-2', '2027-01-10T00:00:00Z'), true, 'en')
    expect((await screen.findByTestId('earth-masked')).textContent).toBe('1.3° · LOLA horizon 7.0° · masked 5.7°')
  })

  it('shows nothing extra when no body is above 0° and under the relief', async () => {
    card(scenario('malapert-a', '2027-01-10T00:00:00Z'), true)
    await screen.findByTestId('score')
    expect(screen.queryByTestId('sun-masked')).toBeNull()
    expect(screen.queryByTestId('earth-masked')).toBeNull()
  })
})
