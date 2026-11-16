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
  it('reads the Earth as 1.3°, masked 5.7° under the LOLA horizon of 7.0° at nobile-rim-2', async () => {
    card(scenario('nobile-rim-2', '2027-01-10T00:00:00Z'), true)
    const reading = await screen.findByTestId('earth-reading')
    expect(reading.textContent).toBe('1.3° · tapada 5.7° (horizonte LOLA 7.0°)')
    expect(reading.closest('li')!.getAttribute('data-masked')).toBe('true')
  })

  it('says it in English too', async () => {
    card(scenario('nobile-rim-2', '2027-01-10T00:00:00Z'), true, 'en')
    expect((await screen.findByTestId('earth-reading')).textContent).toBe('1.3° · masked 5.7° (LOLA horizon 7.0°)')
  })

  it('does not call a body masked when none is above 0° and under the relief', async () => {
    card(scenario('malapert-a', '2027-01-10T00:00:00Z'), true)
    await screen.findByTestId('score')
    for (const id of ['sun-reading', 'earth-reading']) {
      const li = screen.getByTestId(id).closest('li')!
      expect(li.getAttribute('data-masked')).toBe('false')
      expect(li.textContent).not.toMatch(/tapada|masked/)
    }
  })
})

describe('scenario card, the score leads and the Sun and Earth are secondary rows', () => {
  const landing = '2027-01-10T00:00:00Z'

  it('puts the status chip and the score first in the card body, before the Sun and Earth rows', async () => {
    card(scenario('nobile-rim-2', landing), true)
    const block = await screen.findByTestId('status-score')
    const rows = screen.getByTestId('body-readings')
    expect(block.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(block.querySelector('[data-status]')).not.toBeNull()
    expect(screen.getByTestId('score').textContent).toMatch(/^Puntaje: \d+ \/ 100$/)
  })

  it('draws the score with the largest type of the card and the elevations with a smaller one', async () => {
    card(scenario('malapert-a', landing), true)
    const value = (await screen.findByTestId('score')).querySelector('[data-score-value]')!
    expect(value.className).toMatch(/text-display/)
    const sun = screen.getByTestId('sun-reading')
    expect(sun.className).not.toMatch(/text-display|text-figure|text-lead|text-title/)
  })

  it('labels the Sun row "Sol ahora" at the landing and with the hour once the cursor moves', async () => {
    const first = card(scenario('malapert-a', landing), true)
    expect((await screen.findByTestId('sun-label')).textContent).toBe('Sol ahora')
    first.unmount()
    render(
      <I18nProvider lang="es">
        <ScenarioCard
          index={0}
          scenario={scenario('malapert-a', landing)}
          selected
          multiple
          canDuplicate
          delayDays={0}
          cursorHours={36}
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
    expect((await screen.findByTestId('sun-label')).textContent).toBe('Sol en el cursor (hora 36)')
    expect(screen.getByTestId('earth-label').textContent).toBe('Tierra en el cursor (hora 36)')
  })

  it('reads the Sun as elevation, state and azimuth in the same row shape as the Earth', async () => {
    card(scenario('nobile-rim-2', landing), true)
    const sun = await screen.findByTestId('sun-reading')
    expect(sun.textContent).toMatch(/^[−-]?\d+\.\d° · (visible|bajo el horizonte|tapada .*)$/)
    expect(screen.getByTestId('sun-azimuth').textContent).toMatch(/^azimut \d+\.\d°$/)
    expect(screen.getByTestId('earth-azimuth').textContent).toMatch(/^azimut \d+\.\d°$/)
  })
})

describe('scenario card, the landing date reads as UTC without ambiguity', () => {
  it('shows 2027-01-10 00:00 UTC as the main value and keeps the native date control as the labelled editor', async () => {
    card(scenario('malapert-a', '2027-01-10T00:00:00Z'), true)
    const reading = await screen.findByTestId('landing-utc')
    expect(reading.textContent).toBe('2027-01-10 00:00 UTC')
    const editor = screen.getByLabelText('Cambiar fecha y hora (UTC)') as HTMLInputElement
    expect(editor.type).toBe('datetime-local')
    expect(editor.value).toBe('2027-01-10T00:00')
  })

  it('does it in English too', async () => {
    card(scenario('malapert-a', '2027-01-10T00:00:00Z'), true, 'en')
    expect((await screen.findByTestId('landing-utc')).textContent).toBe('2027-01-10 00:00 UTC')
    expect(screen.getByLabelText('Change date and time (UTC)')).toBeTruthy()
  })
})

describe('scenario card, A and B have the same DOM structure', () => {
  // Esqueleto: etiqueta, clases y data-testid de cada nodo; los SVG cuentan como hoja
  // (su interior depende de los datos) y los textos no cuentan.
  function skeleton(el: Element): unknown {
    const tag = el.tagName.toLowerCase()
    if (tag === 'svg') return 'svg'
    return [
      tag,
      [...el.classList].sort().join(' '),
      el.getAttribute('data-testid') ?? '',
      [...el.children].map(skeleton),
    ]
  }

  async function shapeOf(id: string, selected: boolean) {
    const r = card(scenario(id, '2027-01-10T00:00:00Z'), selected)
    await screen.findByTestId('score')
    const article = r.container.querySelector('article')!
    const status = article.querySelector('[data-status]')!.getAttribute('data-status')
    const shape = skeleton(article)
    r.unmount()
    return { shape, status }
  }

  // La insignia «Aproximado» es una marca de honestidad de datos: solo aparece en los
  // sitios sin coordenada oficial, así que se comparan pares con el mismo origen.
  it('compares the full tree for a viable and a not-viable site with an official coordinate', async () => {
    const a = await shapeOf('malapert-a', false)
    const b = await shapeOf('mons-mouton', false)
    expect(a.status).not.toBe(b.status)
    expect(b.shape).toEqual(a.shape)
  })

  it('compares the full tree for approximate sites, one of them with a masked Earth', async () => {
    const a = await shapeOf('nobile-rim-2', false)
    const b = await shapeOf('shackleton-ridge', false)
    const c = await shapeOf('malapert-massif', false)
    expect(new Set([a.status, b.status, c.status]).size).toBeGreaterThan(1)
    expect(b.shape).toEqual(a.shape)
    expect(c.shape).toEqual(a.shape)
  })
})
